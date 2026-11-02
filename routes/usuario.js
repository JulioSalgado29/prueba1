const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta a tu conexión 'db' según la ubicación de tus carpetas

// 1. Buscar dueno_muestra por Email
// Petición: GET /api/dueno_muestra/:email
router.get('/:email', async (req, res) => {
  const { email } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT
        u.id_usuario,
        u.email,
        r.nombre_rol,
        i.id_inventario,
        p.nombre AS nombre_propietario
      FROM usuario u
      INNER JOIN usuario_rol r ON u.id_usuario_rol = r.id_usuario_rol
      INNER JOIN propietario p ON u.id_propietario = p.id_propietario
      INNER JOIN inventario i ON u.id_propietario = i.id_propietario
      WHERE u.email = $1`,
      [email]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error('Error en GET /api/dueno_muestra/:email:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 2. Verificar si un inventario tiene calzados con colores y activos
// Petición: GET /api/dueno_muestra/tiene-colores/:id_inventario
router.get('/tiene-colores/:id_inventario', async (req, res) => {
  const { id_inventario } = req.params;
  try {
    const resultado = await pool.query(
      `SELECT EXISTS (
        SELECT 1 
        FROM calzado c
        INNER JOIN inventario i ON i.id_inventario = c.id_inventario
        WHERE i.id_inventario = $1 
          AND c.colores = true 
          AND c.activo = true
      ) AS tiene_calzado_con_colores`,
      [id_inventario]
    );

    // Retorna { "tiene_calzado_con_colores": true/false }
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error en GET /api/dueno_muestra/tiene-colores/:id_inventario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 3. Listar usuarios de inventario usando el Stored Procedure con cursores
// Petición: GET /api/dueno_muestra/usuarios-inventario/:id_inventario
router.get('/usuarios-inventario/:id_inventario', async (req, res) => {
  const { id_inventario } = req.params;
  
  const client = await pool.connect();
  try {
    // 1. Iniciar la transacción obligatoria para trabajar con cursores en SP
    await client.query('BEGIN');

    // 2. Llamar al Stored Procedure
    await client.query(
      'CALL public.sp_obtener_usuarios_inventario($1, $2)', 
      [id_inventario, 'c_usuarios_inventario']
    );

    // 3. Hacer el FETCH ALL del cursor que abrió el SP
    const resultado = await client.query('FETCH ALL FROM c_usuarios_inventario');

    // 4. Confirmar la transacción
    await client.query('COMMIT');

    // 5. Devolver los registros obtenidos
    res.json(resultado.rows);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en GET /api/dueno_muestra/usuarios-inventario/:id_inventario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// 4. Guardar (Insertar) un usuario por inventario usando el SP
// Petición: POST /api/dueno_muestra/usuario
router.post('/usuario', async (req, res) => {
  const { email, nombre, id_usuario_rol, id_inventario } = req.body;
  const emailLimpio = email ? email.trim().toLowerCase() : '';
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Llamamos al SP pasando id_usuario como NULL (para que sepa que es una inserción)
    await client.query(
      'CALL sp_guardar_o_actualizar_usuario(NULL, $1, $2, $3, $4)',
      [emailLimpio, nombre, id_usuario_rol, id_inventario]
    );

    await client.query('COMMIT');

    res.status(201).json({ mensaje: 'Usuario registrado correctamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en POST /api/dueno_muestra/usuario:', error.message);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// 5. Editar un usuario existente (incluyendo email y rol, sin cambiar inventario) usando el SP
// Petición: PUT /api/dueno_muestra/usuario/:id_usuario
router.put('/usuario/:id_usuario', async (req, res) => {
  const { id_usuario } = req.params;
  const { email, nombre, id_usuario_rol } = req.body;
  const emailLimpio = email ? email.trim().toLowerCase() : '';
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Llamamos al SP pasando el id_usuario a modificar y id_inventario como NULL (no se altera)
    await client.query(
      'CALL sp_guardar_o_actualizar_usuario($1, $2, $3, $4, NULL)',
      [id_usuario, emailLimpio, nombre, id_usuario_rol]
    );

    await client.query('COMMIT');

    res.json({ mensaje: 'Usuario actualizado correctamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en PUT /api/dueno_muestra/usuario/:id_usuario:', error.message);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// 6. Eliminar usuario por ID
// Petición: DELETE /api/dueno_muestra/:id_usuario
router.delete('/:id_usuario', async (req, res) => {
  const { id_usuario } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const resultado = await client.query(
      'DELETE FROM usuario WHERE id_usuario = $1 RETURNING *',
      [id_usuario]
    );

    if (resultado.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    await client.query('COMMIT');

    res.json({ 
      mensaje: 'Usuario eliminado correctamente', 
      usuario_eliminado: resultado.rows[0] 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error en DELETE /api/dueno_muestra/:id_usuario:', error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

module.exports = router;