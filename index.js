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

//#region dueno_muestra
  // Listar dueno_muestra
  app.get('/api/dueno_muestra/:id_inventario', async (req, res) => {
    const { id_inventario } = req.params;
    try {
      const resultado = await pool.query(
      `SELECT 
        id_dueno_muestra,
        email_usuario,
        estado,
        fecha_creacion,
        id_inventario,
        nombre,
        usuario_creacion
      FROM dueno_muestra
      WHERE estado = true AND 
            id_inventario = $1
      ORDER BY nombre DESC`,
      [id_inventario]
    );
      res.json(resultado.rows);
    } catch (error) {
      console.error('Error en GET /api/dueno_muestra:', error.message);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  //Insertar dueno_muestra
  app.post('/api/dueno_muestra', async (req, res) => {
    const { email_usuario, id_inventario, nombre, usuario_creacion } = req.body;

    const emailLimpio = email_usuario.trim().toLowerCase();

    try {
      const nuevo = await pool.query(
        'INSERT INTO dueno_muestra (email_usuario, id_inventario, nombre, usuario_creacion) VALUES ($1, $2, $3, $4) RETURNING *',
        [emailLimpio, id_inventario, nombre, usuario_creacion]
      );

      res.status(201).json(nuevo.rows[0]);

    } catch (error) {
      console.error('Error en POST /api/dueno_muestra:', error.message);  
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  //Editar dueno_muestra
  app.put('/api/dueno_muestra/:id', async (req, res) => {
    const { id } = req.params;
    const { email_usuario, nombre, usuario_creacion } = req.body;

    const emailLimpio = email_usuario.trim().toLowerCase();

    try {
      const resultado = await pool.query(
        'UPDATE dueno_muestra SET email_usuario = $1, nombre = $2, usuario_creacion = $3 WHERE id_dueno_muestra = $4 RETURNING *',
        [emailLimpio, nombre, usuario_creacion, id]
      );

      if (resultado.rows.length === 0) {
        return res.status(404).json({ error: 'dueno_muestra no encontrado' });
      }

      res.json(resultado.rows[0]);

    } catch (error) {
      console.error('Error en PUT /api/dueno_muestra/:id:', error.message);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  //Eliminar dueno_muestra
  app.delete('/api/dueno_muestra/:id', async (req, res) => {
    const { id } = req.params;

    try {
      const resultado = await pool.query(
        'UPDATE dueno_muestra SET estado = $2 WHERE id_dueno_muestra = $1 RETURNING *',
        [id, 'false']
      );

      if (resultado.rows.length === 0) {
        return res.status(404).json({ error: 'dueno_muestra no encontrado' });
      }

      res.json({ mensaje: 'dueno_muestra eliminado correctamente' });

    } catch (error) {
      console.error('Error en DELETE /api/dueno_muestra/:id:', error.message);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });
//#endregion dueno_muestra

/*
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
*/

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en http://0.0.0.0:${PORT}`);
});