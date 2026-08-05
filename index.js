const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ mensaje: 'API corriendo localmente' });
});

// Listar usuarios
app.get('/api/usuarios', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM usuarios');
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/usuarios:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear usuario
app.post('/api/usuarios', async (req, res) => {
  const { nombre, email } = req.body;
  try {
    const nuevo = await pool.query(
      'INSERT INTO usuarios (nombre, email) VALUES ($1, $2) RETURNING *',
      [nombre, email]
    );
    res.status(201).json(nuevo.rows[0]);
  } catch (error) {
    console.error('Error en POST /api/usuarios:', error.message);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en http://0.0.0.0:${PORT}`);
});