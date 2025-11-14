const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const multer = require("multer");
const nodemailer = require("nodemailer");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

// ----------------------------------------------------------------------
// 🔥 SERVIR ARCHIVOS ESTÁTICOS (admin.html y archivos subidos)
// ----------------------------------------------------------------------
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ----------------------------------------------------------------------
// 🔥 CONEXIÓN A MONGODB ATLAS
// ----------------------------------------------------------------------
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://immigrationsolutionsforall:Pelvmten19922025%40%23@immigrationsolutionsfor.r73wvma.mongodb.net/immigrationapp?appName=ImmigrationSolutionsForAll";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch((err) => console.error("❌ Error de conexión a MongoDB:", err));

// ----------------------------------------------------------------------
// 🔥 ESQUEMA DE CLIENTE
// ----------------------------------------------------------------------
const ClientSchema = new mongoose.Schema({
  // Datos personales
  name: String,
  fullName: String,
  birthDate: String,
  citizenship: String,
  currentAddress: String,

  // Contacto
  email: String,
  phone: String,

  // Información del caso
  caseNumber: String,
  immigrationStatus: String,
  processType: String,

  status: {
    type: String,
    default: "Perfil recibido desde la app",
  },

  lastUpdate: {
    type: Date,
    default: Date.now,
  },

  // Documentos subidos
  documents: [
    {
      name: String,
      url: String,
      mimeType: String,
      uploadedAt: Date,
    },
  ],

  // Comunicación
  messages: [
    {
      from: String, // "client" o "office"
      text: String,
      date: Date,
    },
  ],
});

const Client = mongoose.model("Client", ClientSchema);

// ----------------------------------------------------------------------
// 🔥 CONFIGURACIÓN DE MULTER (SUBIDA DE DOCUMENTOS)
// ----------------------------------------------------------------------

// Asegurar que exista la carpeta uploads (en Render NO existe por defecto)
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("📂 Carpeta 'uploads' creada en:", uploadsDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1_000_000_000);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// ----------------------------------------------------------------------
// 🔥 CONFIGURACIÓN DE NODEMAILER
// ----------------------------------------------------------------------
let transporter = null;

if (process.env.MAIL_USER && process.env.MAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
  console.log("📧 Email activado: se enviarán correos con documentos.");
} else {
  console.log(
    "⚠️  MAIL_USER o MAIL_PASS no configurados — no se enviarán correos."
  );
}

// ----------------------------------------------------------------------
// 🔥 RUTAS DEL BACKEND
// ----------------------------------------------------------------------
app.get("/", (req, res) => {
  res.send("✅ Immigration Solutions for All backend is running!");
});

// ------------------------------------------------------------
// 🔥 CREAR / ACTUALIZAR PERFIL (EVITAR DUPLICADOS POR EMAIL)
// ------------------------------------------------------------
app.post("/clients", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email requerido" });
    }

    // Buscar cliente existente por email
    let client = await Client.findOne({ email });

    if (client) {
      // Actualizar datos existentes
      Object.assign(client, req.body);
      client.lastUpdate = new Date();
      await client.save();

      return res.json({ updated: true, client });
    }

    // Crear nuevo cliente
    client = new Client({ ...req.body, lastUpdate: new Date() });
    await client.save();

    res.json({ created: true, client });
  } catch (err) {
    console.error("❌ Error en POST /clients:", err);
    res.status(500).json({ error: "Error al guardar cliente" });
  }
});

// ------------------------------------------------------------
// 🔥 OBTENER TODOS LOS CLIENTES (PANEL ADMIN)
// ------------------------------------------------------------
app.get("/clients", async (req, res) => {
  try {
    const clients = await Client.find();
    res.json(clients);
  } catch (err) {
    console.error("❌ Error en GET /clients:", err);
    res.status(500).json({ error: "Error al obtener clientes" });
  }
});

// ------------------------------------------------------------
// 🔥 ACTUALIZAR ESTATUS DEL CLIENTE (ADMIN)
// ------------------------------------------------------------
app.put("/clients/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { status, lastUpdate: new Date() },
      { new: true }
    );

    if (!client) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    res.json(client);
  } catch (err) {
    console.error("❌ Error en PUT /clients/:id/status:", err);
    res.status(500).json({ error: "Error al actualizar estatus" });
  }
});

// ------------------------------------------------------------
// 🔥 ACTUALIZAR PERFIL COMPLETO POR ID (EDITAR PERFIL)
// ------------------------------------------------------------
app.put("/clients/:id", async (req, res) => {
  try {
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { ...req.body, lastUpdate: new Date() },
      { new: true }
    );

    if (!client) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    res.json(client);
  } catch (err) {
    console.error("❌ Error en PUT /clients/:id:", err);
    res.status(500).json({ error: "Error al actualizar cliente" });
  }
});

// ------------------------------------------------------------
// 🔥 MENSAJES (POR SI LO USAMOS LUEGO)
// ------------------------------------------------------------
app.post("/clients/:id/messages", async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    client.messages.push({
      from: req.body.from,
      text: req.body.text,
      date: new Date(),
    });

    await client.save();
    res.json(client);
  } catch (err) {
    console.error("❌ Error en POST /clients/:id/messages:", err);
    res.status(500).json({ error: "Error al guardar mensaje" });
  }
});

// ------------------------------------------------------------
// 🔥 SUBIR DOCUMENTOS + GUARDAR EN BD + (OPCIONAL) ENVIAR EMAIL
// ------------------------------------------------------------
app.post(
  "/clients/:id/documents",
  upload.single("file"),
  async (req, res) => {
    try {
      const client = await Client.findById(req.params.id);

      if (!client) {
        return res.status(404).json({ error: "Cliente no encontrado" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No se recibió archivo" });
      }

      const file = req.file;

      const docEntry = {
        name: file.originalname,
        url: `/uploads/${file.filename}`,
        mimeType: file.mimetype,
        uploadedAt: new Date(),
      };

      client.documents.push(docEntry);
      client.lastUpdate = new Date();
      await client.save();

      // Enviar email si está configurado
      if (transporter) {
        try {
          const clientName = client.fullName || client.name || "Cliente";
          const clientEmail = client.email || "correo-no-especificado";

          await transporter.sendMail({
            from: `Immigration Solutions for All <${
              process.env.MAIL_USER ||
              "immigrationsolutionsforall@gmail.com"
            }>`,
            to: "immigrationsolutionsforall@gmail.com",
            replyTo: clientEmail, // responde al email del cliente
            subject: `Nuevo documento de ${clientName}`,
            text: `
El cliente ${clientName} (${clientEmail}) ha subido un nuevo documento.

Nombre del archivo: ${file.originalname}
Tipo de archivo: ${file.mimetype}
Fecha de subida: ${new Date().toLocaleString()}

Puedes ver más detalles en el panel de administración.
            `.trim(),
            attachments: [
              {
                filename: file.originalname,
                path: file.path,
              },
            ],
          });

          console.log("✉️  Correo enviado por documento de", clientName);
        } catch (mailErr) {
          console.error("❌ Error enviando correo:", mailErr);
        }
      }

      res.json({ success: true, document: docEntry });
    } catch (err) {
      console.error("❌ Error en POST /clients/:id/documents:", err);
      res.status(500).json({ error: "Error interno al subir documento" });
    }
  }
);

// ----------------------------------------------------------------------
// 🔥 INICIAR SERVIDOR
// ----------------------------------------------------------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
);
