const id = () => crypto.randomUUID();
export const roleNames = {
  doctor: "Médecin",
  nurse: "Infirmier·ère",
  pharmacist: "Pharmacien·ne",
  lab_tech: "Laborantin·e",
  admin: "Administration",
};
export const readKinds = {
  doctor: ["appointment", "lab", "prescription", "note"],
  nurse: ["appointment", "lab", "prescription", "note"],
  pharmacist: ["prescription"],
  lab_tech: ["lab"],
  admin: ["appointment"],
};
export function createDemoApi() {
  const facilities = [
    { id: "demo-ouaga", name: "Centre Démo Ouagadougou", city: "Ouagadougou" },
    { id: "demo-bobo", name: "Centre Démo Bobo", city: "Bobo-Dioulasso" },
  ];
  let user = null;
  const patients = [
    "Awa Exemple",
    "Idrissa Fictif",
    "Mariam Test",
    "Ali Démonstration",
    "Fatou Exemple",
    "Moussa Fictif",
  ].map((name, i) => ({
    id: `demo-${i}`,
    first_name: name.split(" ")[0],
    last_name: name.split(" ")[1],
    national_id: `DEMO-00${i + 1}`,
    date_of_birth: `${1990 + i}-04-12`,
    sex: i % 2 ? "M" : "F",
    phone: "",
    address: "",
    facility_id: "demo-ouaga",
    version: 1,
    created_at: new Date().toISOString(),
  }));
  const records = [
    {
      kind: "appointment",
      title: "Consultation de suivi",
      service: "Médecine générale",
      status: "pending",
      i: 0,
    },
    {
      kind: "appointment",
      title: "Consultation initiale",
      service: "Soins généraux",
      status: "pending",
      i: 1,
    },
    {
      kind: "appointment",
      title: "Visite de contrôle",
      service: "Médecine générale",
      status: "completed",
      i: 2,
    },
    {
      kind: "lab",
      title: "Analyse de démonstration",
      notes: "Exemple de demande, sans prescription médicale réelle.",
      status: "pending",
      i: 0,
    },
    {
      kind: "lab",
      title: "Bilan de démonstration",
      result: "Résultat fictif — aucune interprétation clinique.",
      status: "completed",
      i: 1,
    },
    {
      kind: "prescription",
      title: "Traitement fictif A",
      instructions:
        "Exemple de circuit de dispensation. Ne pas utiliser pour soigner.",
      status: "pending",
      i: 2,
    },
    {
      kind: "note",
      title: "Accueil du patient",
      notes: "Dossier entièrement fictif pour explorer le parcours de soins.",
      status: "completed",
      i: 0,
    },
  ].map((r, i) => ({
    id: `rec-${i}`,
    patient_id: `demo-${r.i}`,
    facility_id: "demo-ouaga",
    kind: r.kind,
    status: r.status,
    version: 1,
    created_at: new Date().toISOString(),
    data: {
      ...r,
      ...(r.kind === "appointment"
        ? {
            scheduled_at: new Date(
              Date.now() + (i + 1) * 3600000,
            ).toISOString(),
          }
        : {}),
    },
  }));
  const transfers = [];
  const audits = [];
  const check = () => {
    if (!user) throw new Error("Connectez-vous pour continuer.");
  };
  return async (path, options = {}) => {
    const method = options.method || "GET",
      body = options.body;
    if (path === "/auth/login") {
      const role = body.role || "doctor";
      const facility = facilities[body.receiving ? 1 : 0];
      user = {
        id: "demo-user",
        name: body.receiving
          ? "Médecin destinataire"
          : "Équipe de démonstration",
        role,
        facility_id: facility.id,
        facility,
      };
      return { ...user };
    }
    if (path === "/auth/me") {
      check();
      return { ...user };
    }
    check();
    if (path === "/auth/logout") {
      user = null;
      return;
    }
    if (path === "/facilities") return facilities;

    const [route, query] = path.split("?"),
      params = new URLSearchParams(query);
    const paginate = (rows) => {
      const offset = Number(params.get("offset") || 0),
        limit = Number(params.get("limit") || 50);
      return {
        items: structuredClone(rows.slice(offset, offset + limit)),
        total: rows.length,
      };
    };
    if (route === "/audit")
      return paginate(
        audits.filter((a) => a.facility_id === user.facility_id).toReversed(),
      );
    if (route === "/dashboard")
      return {
        pending: Object.fromEntries(
          readKinds[user.role].map((kind) => [
            kind,
            records.filter(
              (r) =>
                r.facility_id === user.facility_id &&
                r.kind === kind &&
                r.status === "pending",
            ).length,
          ]),
        ),
        transfers: ["doctor", "nurse"].includes(user.role)
          ? transfers.filter(
              (t) =>
                (t.source_id === user.facility_id ||
                  t.destination_id === user.facility_id) &&
                t.status === "pending",
            ).length
          : null,
      };
    if (route === "/patients" && method === "GET") {
      const q = (params.get("q") || "").toLowerCase();
      const rows = patients.filter(
        (p) =>
          p.facility_id === user.facility_id &&
          `${p.first_name} ${p.last_name} ${p.national_id}`
            .toLowerCase()
            .includes(q),
      );
      return paginate(rows);
    }
    if (route.startsWith("/patients/") && method === "GET")
      return patients.find((p) => p.id === route.split("/")[2]);
    if (route === "/records" && method === "GET") {
      const rows = records.filter(
        (r) =>
          r.facility_id === user.facility_id &&
          readKinds[user.role].includes(r.kind) &&
          (!params.get("kind") || r.kind === params.get("kind")) &&
          (!params.get("status") || r.status === params.get("status")) &&
          (!params.get("patient_id") ||
            r.patient_id === params.get("patient_id")),
      );
      return paginate(
        rows.map((r) => {
          const p = patients.find((p) => p.id === r.patient_id);
          return { ...r, patient_name: `${p.first_name} ${p.last_name}` };
        }),
      );
    }
    if (route === "/transfers" && method === "GET")
      return paginate(
        transfers
          .filter(
            (t) =>
              t.source_id === user.facility_id ||
              t.destination_id === user.facility_id,
          )
          .toReversed(),
      );
    let result;
    if (route === "/patients" && method === "POST") {
      result = {
        ...body,
        id: id(),
        facility_id: user.facility_id,
        version: 1,
        created_at: new Date().toISOString(),
      };
      patients.push(result);
    } else if (route.startsWith("/patients/") && method === "PUT") {
      result = patients.find((p) => p.id === route.split("/")[2]);
      if (result.version !== body.version)
        throw new Error("Actualisez ce dossier.");
      Object.assign(result, body, { version: body.version + 1 });
    } else if (route === "/records" && method === "POST") {
      result = {
        ...body,
        id: id(),
        facility_id: user.facility_id,
        version: 1,
        status: body.kind === "note" ? "completed" : "pending",
        created_at: new Date().toISOString(),
      };
      records.unshift(result);
    } else if (route.startsWith("/records/") && method === "PATCH") {
      result = records.find((r) => r.id === route.split("/")[2]);
      if (result.status !== "pending")
        throw new Error("Élément déjà finalisé.");
      result.status = body.status;
      result.version++;
      if (body.result) result.data.result = body.result;
    } else if (route === "/transfers" && method === "POST") {
      const p = patients.find((p) => p.id === body.patient_id);
      result = {
        ...body,
        id: id(),
        source_id: user.facility_id,
        status: "pending",
        version: 1,
        created_at: new Date().toISOString(),
        patient_snapshot: { first_name: p.first_name, last_name: p.last_name },
      };
      transfers.push(result);
    } else if (route.startsWith("/transfers/") && method === "PATCH") {
      result = transfers.find((t) => t.id === route.split("/")[2]);
      if (result.status !== "pending")
        throw new Error("Transfert déjà traité.");
      result.status = body.status;
      result.version++;
    } else throw new Error("Action indisponible dans cet aperçu.");
    audits.push({
      id: id(),
      at: new Date().toISOString(),
      action: `${method} ${route}`,
      user_id: user.id,
      facility_id: user.facility_id,
      resource_id: result.id,
    });
    return { ...result };
  };
}
