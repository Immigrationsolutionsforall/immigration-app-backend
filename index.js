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
  name: String,
  email: String,
  phone: String,
  caseNumber: String,
  processType: String,
  status: String,
  lastUpdate: Date,
  messages: [
    {
      from: String,
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
