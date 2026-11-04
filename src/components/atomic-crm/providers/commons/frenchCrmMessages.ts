import type { CrmMessages } from "./englishCrmMessages";

export const frenchCrmMessages = {
  resources: {
    service_users: {
      name: "Personne accompagnée |||| Personnes accompagnées",
      forcedCaseName: "Personne accompagnée",
      fields: {
        display_name: "Nom",
        reference_code: "Référence",
        release_date: "Date de sortie",
        programme_day: "Jour",
        risk_tier: "Niveau de risque",
        assigned_worker_id: "Référent",
        consent_status: "Consentement",
        status: "Statut",
        stability: "Stabilité",
        last_checkin_at: "Dernier point",
        nb_open_escalations: "Alertes ouvertes",
      },
      risk_tiers: {
        low: "Faible",
        moderate: "Modéré",
        moderate_high: "Modéré à élevé",
        high: "Élevé",
      },
      stability: {
        stable: "Stable",
        watch: "À surveiller",
        critical: "Critique",
      },
      statuses: {
        active: "Actif",
        paused: "En pause",
        exited: "Sorti",
      },
      consent: {
        pending: "Consentement en attente",
        given: "Consentement donné",
        withdrawn: "Consentement retiré",
      },
      day: "Jour %{day}",
      never: "Jamais",
      details_title: "Statut et référent",
      empty: "Aucune personne accompagnée",
      validation: {
        reference_code: "Utilisez le format RE-12345",
      },
      create: {
        title: "Ajouter une personne accompagnée",
      },
    },
    support_profiles: {
      name: "Profil d'accompagnement |||| Profils d'accompagnement",
      title: "Configuration du profil clinique",
      version: "Version %{version}",
      saved: "Profil enregistré",
      fields: {
        primary_risk_pathway: "Principal facteur de risque",
        active_cbt_module: "Module TCC actif",
        checkin_frequency: "Fréquence des points",
        sentiment_dip_days: "Baisse de moral (jours)",
        missed_checkins_threshold: "Points manqués avant alerte",
        keyword_sensitivity: "Sensibilité aux mots-clés (1-10)",
      },
      pathways: {
        substance_use: "Consommation de substances",
        housing_instability: "Logement instable",
        financial_stress: "Difficultés financières",
        interpersonal_conflict: "Conflits relationnels",
      },
      modules: {
        distress_tolerance: "Tolérance à la détresse",
        cognitive_reframing: "Restructuration cognitive",
        emotional_regulation: "Régulation émotionnelle",
        urge_surfing: "Surf sur l'envie",
        radical_acceptance: "Acceptation radicale",
      },
      frequencies: {
        twice_daily: "Deux fois par jour",
        daily: "Quotidienne",
        every_other_day: "Un jour sur deux",
        weekly: "Hebdomadaire",
      },
    },
    escalations: {
      name: "Alerte |||| Alertes",
      fields: {
        service_user_id: "Personne accompagnée",
        trigger_type: "Déclencheur",
        severity: "Gravité",
        status: "Statut",
        assigned_to: "Assignée à",
        opened_at: "Ouverte",
        notes: "Notes",
      },
      triggers: {
        keyword: "Mot-clé",
        sentiment_dip: "Baisse de moral",
        missed_checkins: "Points manqués",
        manual: "Signalée par l'équipe",
        self_referral: "Demande d'aide",
      },
      severities: {
        low: "Faible",
        medium: "Moyenne",
        high: "Élevée",
        critical: "Critique",
      },
      statuses: {
        open: "Ouverte",
        acknowledged: "Prise en compte",
        resolved: "Résolue",
      },
      actions: {
        acknowledge: "Prendre en compte",
        resolve: "Résoudre",
        resolve_title: "Résoudre cette alerte",
        notes_help: "Qu'est-ce qui a été fait ? Cela figurera au dossier.",
        notes_required: "Ajoutez une note sur ce qui a été fait",
      },
      notifications: {
        acknowledged: "Alerte prise en compte",
        resolved: "Alerte résolue",
      },
      queue: {
        title: "File des alertes",
        needs_attention: "À traiter",
        resolved: "Résolues",
        empty: "Rien à traiter pour le moment",
      },
    },
    activity_events: {
      name: "Activité",
      types: {
        checkin: "Point",
        missed_checkin: "Point manqué",
        cbt_deploy: "Exercice TCC",
        logistics: "Logistique",
        escalation: "Alerte",
        override: "Intervention manuelle",
        profile_change: "Changement de profil",
      },
      empty: "Aucune activité",
    },
    case_notes: {
      name: "Note de suivi |||| Notes de suivi",
      fields: {
        body: "Note",
        author_sales_id: "Auteur",
      },
      new: "Nouvelle note de suivi",
      placeholder: "Ce qui s'est passé, ce qui a été convenu, son état",
      add: "Ajouter la note",
      empty: "Aucune note de suivi",
      system: "Système",
      notifications: {
        created: "Note de suivi ajoutée",
      },
    },
    case_actions: {
      name: "Action |||| Actions",
      fields: {
        title: "Action",
        due_date: "Échéance",
        assigned_to: "Assignée à",
        done_at: "Terminée",
      },
      new: "Nouvelle action",
      placeholder: "ex. Inscription chez un médecin",
      add: "Ajouter l'action",
      empty: "Aucune action en cours",
      recently_done: "Terminées récemment",
      due: "Échéance %{date}",
      overdue: "En retard depuis %{date}",
      notifications: {
        created: "Action ajoutée",
      },
    },
    sales: {
      name: "Utilisateur |||| Utilisateurs",
      team: "Équipe",
      fields: {
        first_name: "Prénom",
        last_name: "Nom",
        email: "E-mail",
        secondary_email: "E-mail secondaire",
        secondary_emails: "E-mails secondaires",
        role: "Rôle",
        disabled: "Désactivé",
      },
      roles: {
        org_admin: "Administrateur de l'organisation",
        clinical_lead: "Responsable clinique",
        key_worker: "Référent",
        viewer: "Lecteur",
      },
      create: {
        error:
          "Une erreur s'est produite lors de la création de l'utilisateur.",
        success:
          "Utilisateur créé. Ils recevront prochainement un email pour définir leur mot de passe.",
        title: "Créer un nouvel utilisateur",
      },
      edit: {
        error: "Une erreur s'est produite. Veuillez réessayer.",
        record_not_found: "Enregistrement introuvable",
        success: "Utilisateur mis à jour avec succès",
        title: "Modifier %{name}",
      },
      action: {
        new: "Nouvel utilisateur",
      },
    },
  },
  crm: {
    control_tower: {
      title: "Tour de contrôle",
      short_title: "Aperçu",
      kpi: {
        active_clients: "Personnes suivies",
        checkin_adherence: "Assiduité aux points (7 jours)",
        open_escalations: "Alertes ouvertes",
        urgent: "%{count} élevées ou critiques",
        no_checkins: "Aucun point pour l'instant",
        caseload: "Vos personnes suivies",
        organisation: "Toute l'organisation",
      },
      stability_chart: "Stabilité sur 7 jours",
      cohort: "Cohorte",
      activity: "Activité en direct",
      viewer_notice:
        "Votre rôle n'affiche que des chiffres agrégés. Les dossiers individuels sont masqués.",
      error: "Les chiffres de la tour de contrôle n'ont pas pu être chargés.",
    },
    demo: {
      switch_title: "Changer d'utilisateur de démonstration",
      viewing_as: "Vue de %{name} (%{role})",
    },
    conversation: {
      title: "Aperçu WhatsApp",
      simulated: "Simulation",
      reset: "Recommencer la conversation",
      placeholder: "Écrivez comme %{name}…",
      message_label: "Message de la personne suivie",
      send: "Envoyer",
      typing: "L'assistant écrit",
      paused:
        "Les réponses automatiques sont suspendues : une alerte est ouverte pour cette personne. Elles reprennent quand l'équipe la clôt.",
      simulate_no_reply:
        "Simuler : personne ne prend l'alerte en charge sous 15 minutes",
      disclaimer:
        "Simulation pour les démonstrations et la formation. Rien n'est envoyé sur WhatsApp et les messages ne sont pas enregistrés ; les alertes et l'activité créées sont de vrais enregistrements.",
      system: {
        escalation_opened:
          "Filtre de risque déclenché : alerte ouverte, réponses automatiques suspendues",
        assistant_paused:
          "Réponses automatiques suspendues tant que l'alerte est ouverte",
        no_staff_reply:
          "15 minutes plus tard, toujours pas prise en charge : contacts d'urgence envoyés",
      },
    },
    audit_trail: {
      title: "Historique de configuration",
      empty: "Aucun historique",
      error: "L'historique n'a pas pu être chargé.",
      by: "par %{name}",
      changed: "Modifié : %{fields}",
      events: {
        service_users: {
          create: "Personne ajoutée",
          update: "Personne modifiée",
          delete: "Personne retirée",
          view: "Dossier consulté",
        },
        support_profiles: {
          create: "Profil créé",
          update: "Profil modifié",
          delete: "Profil supprimé",
          view: "Profil consulté",
        },
        escalations: {
          create: "Alerte ouverte",
          update: "Alerte mise à jour",
          delete: "Alerte supprimée",
          view: "Alerte consultée",
        },
        activity_events: {
          create: "Activité enregistrée",
          update: "Activité modifiée",
          delete: "Activité supprimée",
          view: "Activité consultée",
        },
        case_notes: {
          create: "Note de suivi ajoutée",
          update: "Note de suivi modifiée",
          delete: "Note de suivi supprimée",
          view: "Note de suivi consultée",
        },
        case_actions: {
          create: "Action ajoutée",
          update: "Action mise à jour",
          delete: "Action supprimée",
          view: "Action consultée",
        },
      },
    },
    action: {
      reset_password: "Réinitialiser le mot de passe",
    },
    auth: {
      first_name: "Prénom",
      last_name: "Nom",
      confirm_password: "Confirmer le mot de passe",
      confirmation_required:
        "Veuillez suivre le lien que nous venons de vous envoyer par email pour confirmer votre compte.",
      recovery_email_sent:
        "Si vous êtes un utilisateur enregistré, vous devriez recevoir prochainement un e-mail de récupération de mot de passe.",
      sign_in_failed: "Échec de la connexion.",
      sign_in_google_workspace: "Connectez-vous avec Google Workplace",
      signup: {
        create_account: "Créer un compte",
        create_first_user:
          "Créez le premier compte utilisateur pour terminer la configuration.",
        creating: "Création...",
        initial_user_created: "Utilisateur initial créé avec succès",
      },
      welcome_title: "Bienvenue sur Atomic CRM",
    },
    common: {
      account_manager: "Responsable de compte",
      activity: "Activité",
      added: "ajoutée",
      details: "Détails",
      last_activity_with_date: "dernière activité %{date}",
      load_more: "Charger plus",
      misc: "Divers",
      past: "Passé",
      read_more: "En savoir plus",
      retry: "Réessayer",
      show_less: "Afficher moins",
      task_count: "%{smart_count} tâche |||| %{smart_count} tâches",
      copied: "Copié !",
      copy: "Copier",
      loading: "Chargement...",
      me: "Moi",
    },
    changelog: {
      title: "Notes de version",
    },
    image_editor: {
      change: "Changer",
      drop_hint:
        "Déposez un fichier à télécharger ou cliquez pour le sélectionner.",
      editable_content: "Contenu modifiable",
      title: "Télécharger et redimensionner l'image",
      update_image: "Mettre à jour l'image",
    },
    settings: {
      about: "À propos",
      companies: {
        sectors: "Secteurs",
      },
      dark_mode_logo: "Logo du mode sombre",
      deals: {
        categories: "Catégories",
        currency: "Devise",
        pipeline_help:
          "Sélectionnez les étapes d'affaire à considérer comme des affaires dans le pipeline.",
        pipeline_statuses: "Statuts des pipelines",
        stages: "Étapes",
      },
      light_mode_logo: "Logo du mode clair",
      notes: {
        statuses: "Statuts",
      },
      reset_defaults: "Réinitialiser aux valeurs par défaut",
      save_error: "Échec de l'enregistrement de la configuration",
      saved: "Configuration enregistrée avec succès",
      saving: "Enregistrement...",
      tasks: {
        types: "Types",
      },
      preferences: "Préférences",
      title: "Paramètres",
      app_title: "Titre de l'application",
      sections: {
        branding: "Image de marque",
      },
      validation: {
        duplicate: "%{display_name} en double : %{items}",
        in_use:
          "Impossible de supprimer %{display_name} encore utilisés par des affaires : %{items}",
        validating: "Validation\u2026",
        entities: {
          categories: "catégories",
          stages: "étapes",
        },
      },
    },
    theme: {
      dark: "Sombre",
      label: "Thème",
      light: "Clair",
      system: "Système",
    },
    language: "Langue",
    navigation: {
      label: "Navigation CRM",
    },
    profile: {
      add_secondary_email: "Ajouter un e-mail",
      email_taken: "%{email} est déjà utilisée par un autre utilisateur",
      no_secondary_emails: "Aucun",
      secondary_email_invalid: "%{email} n'est pas une adresse e-mail valide",
      secondary_email_is_primary: "%{email} est déjà votre adresse principale",
      secondary_email_taken:
        "%{email} est déjà utilisée par un autre utilisateur",
      too_many_secondary_emails:
        "Vous ne pouvez pas ajouter plus de 10 adresses e-mail secondaires",
      secondary_emails_help:
        "Autres adresses depuis lesquelles vous envoyez des e-mails. Laissez-en une vide pour la supprimer.",
      mcp: {
        title: "Serveur MCP",
        description:
          "Utilisez cette URL pour connecter votre assistant IA aux données de votre CRM via le Model Context Protocol (MCP).",
      },
      password: {
        change: "Changer le mot de passe",
      },
      password_reset_sent:
        "Un e-mail de réinitialisation du mot de passe a été envoyé à votre adresse e-mail",
      record_not_found: "Enregistrement introuvable",
      title: "Profil",
      updated: "Votre profil a été mis à jour",
      update_error: "Une erreur s'est produite. Veuillez réessayer",
    },
    validation: {
      invalid_url: "Doit être une URL valide",
      invalid_linkedin_url: "L'URL doit provenir de linkedin.com",
    },
  },
} satisfies CrmMessages;
