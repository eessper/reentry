import type { RAFile } from "../../types";
import { ATTACHMENTS_BUCKET } from "../commons/attachments";
import { getSupabaseClient } from "./supabase";

/**
 * The attachments bucket is private. Files live under
 * `<organisation_id>/<folder>/<uuid><ext>`:
 * - `notes`: note attachments, readable only by staff who can see the note
 * - `shared`: logos and avatars, readable by the whole organisation
 * Storage row-level security enforces this; the browser only ever gets
 * short-lived signed URLs.
 */
export type AttachmentFolder = "notes" | "shared";

/** How long a signed URL handed to the browser stays valid, in seconds. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

const STORAGE_URL_PATTERN = new RegExp(
  `/storage/v1/object/(?:public|sign|authenticated)/${ATTACHMENTS_BUCKET}/([^?#]+)`,
);

/**
 * The bucket path a stored URL points at, or undefined when it isn't one of
 * our storage URLs (an external image, a data: URL, a bundled asset).
 * Signed and legacy public URLs both carry the path, so it can be re-signed.
 */
export const getStoragePath = (url: string | undefined): string | undefined => {
  const match = url ? STORAGE_URL_PATTERN.exec(url) : null;
  return match ? decodeURIComponent(match[1]) : undefined;
};

const getFilePath = (file: RAFile | null | undefined) =>
  file?.path ?? getStoragePath(file?.src);

/**
 * Returns copies of `files` whose `src` is a fresh signed URL. Files that
 * aren't in the bucket are returned unchanged; so are files the caller may
 * no longer read, which then simply fail to load.
 */
export const signFiles = async <T extends RAFile>(
  files: readonly T[],
): Promise<T[]> => {
  const paths = [
    ...new Set(files.map(getFilePath).filter((path) => path != null)),
  ];
  if (paths.length === 0) {
    return [...files];
  }

  const { data, error } = await getSupabaseClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error("Failed to sign attachment URLs", error);
    return [...files];
  }

  const signedUrls = new Map(
    (data ?? [])
      .filter((signed) => signed.path && signed.signedUrl)
      .map((signed) => [signed.path, signed.signedUrl]),
  );
  return files.map((file) => {
    const path = getFilePath(file);
    const signedUrl = path ? signedUrls.get(path) : undefined;
    return signedUrl ? { ...file, path, src: signedUrl } : file;
  });
};

export const signFile = async <T extends RAFile>(
  file: T | null | undefined,
): Promise<T | null | undefined> =>
  file ? (await signFiles([file]))[0] : file;

/** Re-signs a storage URL kept as a plain string (organisation logos). */
export const signUrl = async (url: string | undefined) =>
  getStoragePath(url) ? (await signFile({ src: url } as RAFile))?.src : url;

const getCurrentOrganisationId = async () => {
  const supabase = getSupabaseClient();
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user.id;
  const { data, error } = userId
    ? await supabase
        .from("memberships")
        .select("organisation_id")
        .eq("user_id", userId)
        .single()
    : { data: null, error: new Error("Not signed in") };
  if (error || !data) {
    throw new Error("Could not find your organisation to store the file");
  }
  return data.organisation_id as string;
};

/**
 * Uploads a new file into the caller's organisation folder and returns it
 * with its `path` and a signed `src`. Files already in the bucket are kept
 * as they are.
 */
export const uploadToBucket = async (
  fi: RAFile,
  folder: AttachmentFolder,
): Promise<RAFile> => {
  const existingPath = getFilePath(fi);
  if (
    existingPath &&
    !fi.src.startsWith("blob:") &&
    !fi.src.startsWith("data:")
  ) {
    // Already stored and readable by the caller: keep it. Otherwise (e.g. a
    // file imported from another instance) download it again from its src.
    const { error } = await getSupabaseClient()
      .storage.from(ATTACHMENTS_BUCKET)
      .createSignedUrl(existingPath, 60);
    if (!error) {
      return fi;
    }
  }

  const dataContent = fi.src
    ? await fetch(fi.src)
        .then((res) => {
          if (res.status !== 200) {
            return null;
          }
          return res.blob();
        })
        .catch(() => null)
    : fi.rawFile;

  if (dataContent == null) {
    // We weren't able to download the file from its src (e.g. user must be signed in on another website to access it)
    // or the file has no content (not probable)
    // In that case, just return it as is: when trying to download it, users should be redirected to the other website
    // and see they need to be signed in. It will then be their responsibility to upload the file back to the note.
    return fi;
  }

  const file = fi.rawFile;
  const fileParts = file.name.split(".");
  const fileExt = fileParts.length > 1 ? `.${fileParts.pop()}` : "";
  const organisationId = await getCurrentOrganisationId();
  const filePath = `${organisationId}/${folder}/${crypto.randomUUID()}${fileExt}`;
  const { error: uploadError } = await getSupabaseClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .upload(filePath, dataContent);

  if (uploadError) {
    console.error("uploadError", uploadError);
    throw new Error("Failed to upload attachment");
  }

  const { data, error: signError } = await getSupabaseClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);

  if (signError || !data) {
    console.error("signError", signError);
    throw new Error("Failed to upload attachment");
  }

  return {
    ...fi,
    path: filePath,
    src: data.signedUrl,
    // save MIME type
    type: file.type,
  };
};
