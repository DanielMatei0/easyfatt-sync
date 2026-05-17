const MARKETING_API_URL =
  "https://aven-labs.com/api/marketing/easyfatt-sync/send";

/** Limite destinatari per richiesta (sicurezza) */
const MARKETING_MAX_BATCH_SIZE = 50;

const MAX_SEND_HISTORY = 2000;

const DEFAULT_CONSENT_VALUES = [
  "sì",
  "si",
  "true",
  "1",
  "yes",
  "autorizzato",
  "s",
  "y",
];

const TEMPLATE_VARIABLES = [
  { key: "firstName", label: "Nome", token: "{{firstName}}" },
  { key: "lastName", label: "Cognome", token: "{{lastName}}" },
  { key: "points", label: "Punti", token: "{{points}}" },
  { key: "businessName", label: "Nome negozio", token: "{{businessName}}" },
  { key: "fidelityCardNumber", label: "N° fidelity", token: "{{fidelityCardNumber}}" },
  { key: "birthday", label: "Compleanno", token: "{{birthday}}" },
  { key: "reward", label: "Premio", token: "{{reward}}" },
];

const AUTOMATION_TYPES = {
  birthday: {
    label: "Compleanno cliente",
    description: "Invia un augurio il giorno del compleanno.",
    defaultSubject: "Buon compleanno {{firstName}}! 🎂",
    defaultBody:
      "<p>Ciao {{firstName}},</p><p>da tutto il team di {{businessName}} ti auguriamo un felice compleanno!</p><p>A presto!</p>",
  },
  points_threshold: {
    label: "Soglia punti fidelity",
    description: "Quando i punti raggiungono una soglia (es. 100, 200, 500).",
    defaultSubject: "Hai raggiunto {{points}} punti!",
    defaultBody:
      "<p>Ciao {{firstName}},</p><p>complimenti! Hai raggiunto <strong>{{points}}</strong> punti sulla tua fidelity card.</p><p>{{businessName}}</p>",
  },
  new_fidelity: {
    label: "Nuova fidelity card",
    description: "Benvenuto per attivazione fidelity oggi o primo contatto.",
    defaultSubject: "Benvenuto nella fidelity {{businessName}}",
    defaultBody:
      "<p>Ciao {{firstName}},</p><p>la tua fidelity card <strong>{{fidelityCardNumber}}</strong> è attiva!</p><p>{{businessName}}</p>",
  },
  inactive_customer: {
    label: "Cliente inattivo",
    description: "Cliente senza acquisti da X giorni.",
    defaultSubject: "Ti aspettiamo, {{firstName}}",
    defaultBody:
      "<p>Ciao {{firstName}},</p><p>è da un po' che non ti vediamo. Passa da {{businessName}}!</p>",
  },
  custom: {
    label: "Personalizzata",
    description: "Automazione con regole base (consenso, email).",
    defaultSubject: "Messaggio da {{businessName}}",
    defaultBody: "<p>Ciao {{firstName}},</p><p>un messaggio da {{businessName}}.</p>",
  },
};

const COLUMN_MAPPING_FIELDS = [
  { key: "firstName", label: "Nome" },
  { key: "lastName", label: "Cognome" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefono" },
  { key: "birthDate", label: "Data nascita" },
  { key: "fidelityCardNumber", label: "Numero fidelity" },
  { key: "fidelityActivatedAt", label: "Data attivazione fidelity" },
  { key: "points", label: "Punti" },
  { key: "marketingConsent", label: "Consenso marketing" },
  { key: "lastPurchaseDate", label: "Ultimo acquisto" },
];

module.exports = {
  MARKETING_API_URL,
  MARKETING_MAX_BATCH_SIZE,
  MAX_SEND_HISTORY,
  DEFAULT_CONSENT_VALUES,
  TEMPLATE_VARIABLES,
  AUTOMATION_TYPES,
  COLUMN_MAPPING_FIELDS,
};
