import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const ATTACHMENTS_BUCKET =
  Deno.env.get("VITE_ATTACHMENTS_BUCKET") || "attachments";

// Storage accepts up to 1000 paths per remove call.
const BATCH_SIZE = 1000;

/**
 * Deletes the files waiting in `storage_deletion_queue`.
 *
 * The queue is filled only by the `cleanup_note_attachments` database
 * trigger, which queues a file once no note uses it any more and only when it
 * sits in the note's own organisation folder. This function never takes paths
 * from the request: any signed-in user can wake it up, but it can only delete
 * files the database has already decided are orphaned.
 */
const drainDeletionQueue = async () => {
  const { data: queued, error: readError } = await supabaseAdmin
    .from("storage_deletion_queue")
    .select("path")
    .order("queued_at")
    .limit(BATCH_SIZE);

  if (readError) {
    console.error("Failed to read the storage deletion queue", readError);
    return jsonResponse({ error: "Failed to delete note attachments" }, 500);
  }

  const paths = (queued ?? []).map(({ path }: { path: string }) => path);
  if (paths.length === 0) {
    return jsonResponse({ status: "skipped", reason: "no_paths_to_delete" });
  }

  const { error: removeError } = await supabaseAdmin.storage
    .from(ATTACHMENTS_BUCKET)
    .remove(paths);

  if (removeError) {
    console.error("Failed to delete note attachments", {
      paths,
      error: removeError,
    });
    return jsonResponse({ error: "Failed to delete note attachments" }, 500);
  }

  const { error: dequeueError } = await supabaseAdmin
    .from("storage_deletion_queue")
    .delete()
    .in("path", paths);

  if (dequeueError) {
    // The files are gone; leaving them queued only means a harmless retry.
    console.error("Failed to dequeue deleted attachments", dequeueError);
  }

  return jsonResponse({ status: "ok", deleted: paths.length });
};

Deno.serve(async (req: Request) =>
  AuthMiddleware(req, async (req: Request) => {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method Not Allowed" }, 405);
    }
    return drainDeletionQueue();
  }),
);

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
