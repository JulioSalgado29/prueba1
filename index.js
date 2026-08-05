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

// Expresión regular para validar formato de correo electrónico
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Crear usuario con validaciones
app.post('/api/usuarios', async (req, res) => {
  const { nombre, email } = req.body;

  // 1. Validar que los campos existan y no estén vacíos o con solo espacios
  if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }

  if (!email || typeof email !== 'string' || email.trim() === '') {
    return res.status(400).json({ error: 'El email es obligatorio' });
  }

  const nombreLimpio = nombre.trim();
  const emailLimpio = email.trim().toLowerCase();

  // 2. Validar longitud mínima del nombre
  if (nombreLimpio.length < 2) {
    return res.status(400).json({ error: 'El nombre debe tener al menos 2 caracteres' });
  }

  // 3. Validar estructura del email con la Regex
  if (!EMAIL_REGEX.test(emailLimpio)) {
    return res.status(400).json({ error: 'El formato del email no es válido' });
  }

  try {
    const nuevo = await pool.query(
      'INSERT INTO usuarios (nombre, email) VALUES ($1, $2) RETURNING *',
      [nombreLimpio, emailLimpio]
    );

    res.status(201).json(nuevo.rows[0]);

  } catch (error) {
    console.error('Error en POST /api/usuarios:', error.message);

    // 4. Capturar error de PostgreSQL de email duplicado (código 23505 = unique_violation)
    if (error.code === '23505') {
      return res.status(409).json({ error: 'El correo electrónico ya está registrado' });
    }

    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en http://0.0.0.0:${PORT}`);
});