export const englishCrmMessages = {
  resources: {
    service_users: {
      name: "Service user |||| Service users",
      forcedCaseName: "Service user",
      fields: {
        display_name: "Name",
        reference_code: "Reference",
        release_date: "Release date",
        programme_day: "Day",
        risk_tier: "Risk tier",
        assigned_worker_id: "Key worker",
        consent_status: "Consent",
        status: "Status",
        stability: "Stability",
        last_checkin_at: "Last check-in",
        nb_open_escalations: "Open escalations",
      },
      risk_tiers: {
        low: "Low",
        moderate: "Moderate",
        moderate_high: "Moderate-high",
        high: "High",
      },
      stability: {
        stable: "Stable",
        watch: "Watch",
        critical: "Critical",
      },
      statuses: {
        active: "Active",
        paused: "Paused",
        exited: "Exited",
      },
      consent: {
        pending: "Consent pending",
        given: "Consent given",
        withdrawn: "Consent withdrawn",
      },
      day: "Day %{day}",
      never: "Never",
      details_title: "Status and assignment",
      empty: "No service users yet",
      validation: {
        reference_code: "Use the format RE-12345",
      },
      create: {
        title: "Add a service user",
      },
    },
    support_profiles: {
      name: "Support profile |||| Support profiles",
      title: "Clinical profile configuration",
      version: "Version %{version}",
      saved: "Profile saved",
      fields: {
        primary_risk_pathway: "Primary risk pathway",
        active_cbt_module: "Active CBT module",
        checkin_frequency: "Check-in frequency",
        sentiment_dip_days: "Sentiment dip (days)",
        missed_checkins_threshold: "Missed check-ins before escalating",
        keyword_sensitivity: "Keyword sensitivity (1-10)",
      },
      pathways: {
        substance_use: "Substance use",
        housing_instability: "Housing instability",
        financial_stress: "Financial stress",
        interpersonal_conflict: "Interpersonal conflict",
      },
      modules: {
        distress_tolerance: "Distress tolerance",
        cognitive_reframing: "Cognitive reframing",
        emotional_regulation: "Emotional regulation",
        urge_surfing: "Urge surfing",
        radical_acceptance: "Radical acceptance",
      },
      frequencies: {
        twice_daily: "Twice daily",
        daily: "Daily",
        every_other_day: "Every other day",
        weekly: "Weekly",
      },
    },
    escalations: {
      name: "Escalation |||| Escalations",
      fields: {
        service_user_id: "Service user",
        trigger_type: "Trigger",
        severity: "Severity",
        status: "Status",
        assigned_to: "Assigned to",
        opened_at: "Opened",
        notes: "Notes",
      },
      triggers: {
        keyword: "Keyword",
        sentiment_dip: "Sentiment dip",
        missed_checkins: "Missed check-ins",
        manual: "Raised by staff",
        self_referral: "Asked for help",
      },
      severities: {
        low: "Low",
        medium: "Medium",
        high: "High",
        critical: "Critical",
      },
      statuses: {
        open: "Open",
        acknowledged: "Acknowledged",
        resolved: "Resolved",
      },
      actions: {
        acknowledge: "Acknowledge",
        resolve: "Resolve",
        resolve_title: "Resolve this escalation",
        notes_help: "What was done? This goes in the record.",
        notes_required: "Add a note saying what was done",
      },
      notifications: {
        acknowledged: "Escalation acknowledged",
        resolved: "Escalation resolved",
      },
      queue: {
        title: "Escalation queue",
        needs_attention: "Needs attention",
        resolved: "Resolved",
        empty: "Nothing needs attention right now",
      },
    },
    activity_events: {
      name: "Activity",
      types: {
        checkin: "Check-in",
        missed_checkin: "Missed check-in",
        cbt_deploy: "CBT exercise",
        logistics: "Logistics",
        escalation: "Escalation",
        override: "Override",
        profile_change: "Profile change",
      },
      empty: "No activity yet",
    },
    case_notes: {
      name: "Case note |||| Case notes",
      fields: {
        body: "Note",
        author_sales_id: "Author",
      },
      new: "New case note",
      placeholder: "What happened, what was agreed, how they seemed",
      add: "Add note",
      empty: "No case notes yet",
      system: "System",
      notifications: {
        created: "Case note added",
      },
    },
    case_actions: {
      name: "Action |||| Actions",
      fields: {
        title: "Action",
        due_date: "Due",
        assigned_to: "Assigned to",
        done_at: "Done",
      },
      new: "New action",
      placeholder: "e.g. Book GP registration",
      add: "Add action",
      empty: "No open actions",
      recently_done: "Recently done",
      due: "Due %{date}",
      overdue: "Overdue since %{date}",
      notifications: {
        created: "Action added",
      },
    },
    sales: {
      name: "User |||| Users",
      team: "Team",
      fields: {
        first_name: "First name",
        last_name: "Last name",
        email: "Email",
        secondary_email: "Secondary email",
        secondary_emails: "Secondary emails",
        role: "Role",
        disabled: "Disabled",
      },
      roles: {
        org_admin: "Organisation admin",
        clinical_lead: "Clinical lead",
        key_worker: "Key worker",
        viewer: "Viewer",
      },
      create: {
        error: "An error occurred while creating the user.",
        success:
          "User created. They will soon receive an email to set their password.",
        title: "Create a new user",
      },
      edit: {
        error: "An error occurred. Please try again.",
        record_not_found: "Record not found",
        success: "User updated successfully",
        title: "Edit %{name}",
      },
      action: {
        new: "New user",
      },
    },
  },
  crm: {
    control_tower: {
      title: "Live Control Tower",
      short_title: "Overview",
      kpi: {
        active_clients: "Active clients",
        checkin_adherence: "Check-in adherence (7 days)",
        open_escalations: "Open escalations",
        urgent: "%{count} high or critical",
        no_checkins: "No check-ins yet",
        caseload: "Your caseload",
        organisation: "Whole organisation",
      },
      stability_chart: "7-day stability",
      cohort: "Cohort",
      activity: "Live activity",
      viewer_notice:
        "Your role shows aggregated figures only. Individual records are hidden.",
      error: "The Control Tower figures could not be loaded.",
    },
    demo: {
      switch_title: "Switch demo user",
      viewing_as: "Viewing as %{name} (%{role})",
    },
    conversation: {
      title: "WhatsApp preview",
      simulated: "Simulated",
      reset: "Start the conversation again",
      placeholder: "Type as %{name} would…",
      message_label: "Message from the service user",
      send: "Send",
      paused:
        "AI replies are paused: an escalation is open for this person. They resume when staff resolve it.",
      simulate_no_reply: "Simulate: nobody acknowledges within 15 minutes",
      disclaimer:
        "Simulation for demos and training. Nothing is sent to WhatsApp and the messages are not saved; the escalations and activity it creates are real records.",
      system: {
        escalation_opened:
          "Risk screen matched: escalation opened, AI replies paused",
        assistant_paused: "AI replies paused while the escalation is open",
        no_staff_reply:
          "15 minutes later, still not acknowledged: crisis contacts sent",
      },
    },
    audit_trail: {
      title: "Configuration audit trail",
      empty: "No history yet",
      error: "The audit trail could not be loaded.",
      by: "by %{name}",
      changed: "Changed %{fields}",
      events: {
        service_users: {
          create: "Service user added",
          update: "Service user updated",
          delete: "Service user removed",
          view: "Record opened",
        },
        support_profiles: {
          create: "Profile created",
          update: "Profile changed",
          delete: "Profile removed",
          view: "Profile opened",
        },
        escalations: {
          create: "Escalation opened",
          update: "Escalation updated",
          delete: "Escalation deleted",
          view: "Escalation opened for viewing",
        },
        activity_events: {
          create: "Activity recorded",
          update: "Activity changed",
          delete: "Activity removed",
          view: "Activity opened",
        },
        case_notes: {
          create: "Case note added",
          update: "Case note edited",
          delete: "Case note deleted",
          view: "Case note opened",
        },
        case_actions: {
          create: "Action added",
          update: "Action updated",
          delete: "Action deleted",
          view: "Action opened",
        },
      },
    },
    action: {
      reset_password: "Reset Password",
    },
    auth: {
      first_name: "First name",
      last_name: "Last name",
      confirm_password: "Confirm password",
      confirmation_required:
        "Please follow the link we just sent you by email to confirm your account.",
      recovery_email_sent:
        "If you're a registered user, you should receive a password recovery email shortly.",
      sign_in_failed: "Failed to log in.",
      sign_in_google_workspace: "Sign in with Google Workplace",
      signup: {
        create_account: "Create account",
        create_first_user:
          "Create the first user account to complete the setup.",
        creating: "Creating...",
        initial_user_created: "Initial user successfully created",
      },
      welcome_title: "Welcome to Atomic CRM",
    },
    common: {
      account_manager: "Account manager",
      activity: "Activity",
      added: "added",
      details: "Details",
      last_activity_with_date: "last activity %{date}",
      load_more: "Load more",
      misc: "Misc",
      past: "Past",
      read_more: "Read more",
      retry: "Retry",
      show_less: "Show less",
      copied: "Copied!",
      copy: "Copy",
      loading: "Loading...",
      me: "Me",
      task_count: "%{smart_count} task |||| %{smart_count} tasks",
    },
    changelog: {
      title: "Changelog",
    },
    image_editor: {
      change: "Change",
      drop_hint: "Drop a file to upload, or click to select it.",
      editable_content: "Editable content",
      title: "Upload and resize image",
      update_image: "Update Image",
    },
    settings: {
      about: "About",
      companies: {
        sectors: "Sectors",
      },
      dark_mode_logo: "Dark Mode Logo",
      deals: {
        categories: "Categories",
        currency: "Currency",
        pipeline_help:
          "Select which deal stages should count as pipeline deals.",
        pipeline_statuses: "Pipeline Statuses",
        stages: "Stages",
      },
      light_mode_logo: "Light Mode Logo",
      notes: {
        statuses: "Statuses",
      },
      reset_defaults: "Reset to Defaults",
      save_error: "Failed to save configuration",
      saved: "Configuration saved successfully",
      saving: "Saving...",
      tasks: {
        types: "Types",
      },
      preferences: "Preferences",
      title: "Settings",
      app_title: "App Title",
      sections: {
        branding: "Branding",
      },
      validation: {
        duplicate: "Duplicate %{display_name}: %{items}",
        in_use:
          "Cannot remove %{display_name} that are still used by deals: %{items}",
        validating: "Validating\u2026",
        entities: {
          categories: "categories",
          stages: "stages",
        },
      },
    },
    theme: {
      dark: "Dark",
      label: "Theme",
      light: "Light",
      system: "System",
    },
    language: "Language",
    navigation: {
      label: "CRM navigation",
    },
    profile: {
      add_secondary_email: "Add an email",
      email_taken: "%{email} is already used by another user",
      no_secondary_emails: "None",
      secondary_email_invalid: "%{email} is not a valid email address",
      secondary_email_is_primary: "%{email} is already your main address",
      secondary_email_taken: "%{email} is already used by another user",
      too_many_secondary_emails:
        "You cannot add more than 10 secondary email addresses",
      secondary_emails_help:
        "Other addresses you send emails from. Leave one empty to remove it.",
      mcp: {
        title: "MCP Server",
        description:
          "Use this URL to connect your AI assistant to your CRM data via the Model Context Protocol (MCP).",
      },
      password: {
        change: "Change password",
      },
      password_reset_sent:
        "A reset password email has been sent to your email address",
      record_not_found: "Record not found",
      title: "Profile",
      updated: "Your profile has been updated",
      update_error: "An error occurred. Please try again",
    },
    validation: {
      invalid_url: "Must be a valid URL",
      invalid_linkedin_url: "URL must be from linkedin.com",
    },
  },
} as const;

type MessageSchema<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends Record<string, unknown>
      ? MessageSchema<T[K]>
      : never;
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown>
    ? DeepPartial<T[K]>
    : T[K];
};

export type CrmMessages = MessageSchema<typeof englishCrmMessages>;
export type PartialCrmMessages = DeepPartial<CrmMessages>;
