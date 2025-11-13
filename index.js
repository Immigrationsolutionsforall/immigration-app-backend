const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.use(cors());
app.use(express.json());

// 👉 PRIMERO buscamos la cadena en las variables de entorno (para la nube)
// 👉 si no existe, usamos la que tienes ahora mismo (para tu Mac)
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://immigrationsolutionsforall:Pelvmten19922025%40%23@immigrationsolutionsfor.r73wvma.mongodb.net/immigrationapp?appName=ImmigrationSolutionsForAll";

// 🔗 CONEXIÓN A MONGODB ATLAS
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch((err) => console.error("❌ Error de conexión a MongoDB:", err));

// ESQUEMA
const ClientSchema = new mongoose.Schema({
  // Datos básicos del cliente
  name: String,                // por compatibilidad con lo que ya usabas
  fullName: String,            // nombre completo desde la app móvil
  birthDate: String,           // fecha de nacimiento
  citizenship: String,         // ciudadanía
  currentAddress: String,      // dirección actual

  email: String,
  phone: String,

  // Información del caso
  caseNumber: String,          // por si usas número de caso interno
  immigrationStatus: String,   // I-220A, Parole, Residente, etc.
  processType: String,         // tipo de proceso migratorio
  status: {
    type: String,
    default: 'Perfil recibido',
  },
  lastUpdate: {
    type: Date,
    default: Date.now,
  },

  // Documentos que el cliente suba
  documents: [
    {
      name: String,        // nombre del archivo
      url: String,         // enlace donde estará guardado
      mimeType: String,    // tipo de archivo (pdf, image/jpg, etc.)
      uploadedAt: Date,    // fecha de subida
    },
  ],

  // Mensajes entre cliente y oficina
  messages: [
    {
      from: String,        // 'client' o 'office'
      text: String,
      date: Date,
    },
  ],
});

const Client = mongoose.model("Client", ClientSchema);


// RUTAS
app.get("/", (req, res) => {
  res.send("✅ Immigration Solutions for All backend is running!");
});

app.get("/clients", async (req, res) => {
  const clients = await Client.find();
  res.json(clients);
});

app.post("/clients", async (req, res) => {
  const client = new Client({ ...req.body, lastUpdate: new Date() });
  await client.save();
  res.json(client);
});

app.put("/clients/:id/status", async (req, res) => {
  const { status } = req.body;
  const client = await Client.findByIdAndUpdate(
    req.params.id,
    { status, lastUpdate: new Date() },
    { new: true }
  );
  res.json(client);
});

// 🔄 Actualizar datos completos de un cliente (nombre, teléfono, status, etc.)
app.put("/clients/:id", async (req, res) => {
  try {
    const updates = {
      ...req.body,
      lastUpdate: new Date(),
    };

    const client = await Client.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    );

    if (!client) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    res.json(client);
  } catch (error) {
    console.error("Error al actualizar cliente:", error);
    res.status(500).json({ error: "Error interno al actualizar el cliente" });
  }
});


app.post("/clients/:id/messages", async (req, res) => {
  const client = await Client.findById(req.params.id);
  client.messages.push({
    from: req.body.from,
    text: req.body.text,
    date: new Date(),
  });
  await client.save();
  res.json(client);
});

// SERVIDOR
const PORT = process.env.PORT || 4000; // 👈 esto es para la nube también
app.listen(PORT, () =>
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
);
