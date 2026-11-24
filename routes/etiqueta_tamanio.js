const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta a tu conexión 'db'

// ── Reglas de medidas (mm) ─────────────────────────────────────
const ANCHO_MIN = 20;
const ANCHO_MAX = 300;
const LARGO_MIN = 15;
const LARGO_MAX = 600;

// Predeterminado inicial de cada inventario
const DEFAULT_ANCHO = 100;
const DEFAULT_LARGO = 60;

const LOCK_NS = 7001; // namespace para el advisory lock
const COLS = 'id_etiqueta_tamanio, ancho, largo, predeterminado';

// ── Helpers ────────────────────────────────────────────────────
class HttpError extends Error {
  constructor(status, body) {
    super(body.mensaje || body.error || 'Error');
    this.status = status;
    this.body = body;
  }
}

function aEntero(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function validarMedidas(ancho, largo) {
  if (ancho === null || largo === null) {
    return 'El ancho y el largo deben ser números enteros (mm)';
  }
  if (ancho < ANCHO_MIN || ancho > ANCHO_MAX) {
    return `El ancho debe estar entre ${ANCHO_MIN} y ${ANCHO_MAX} mm`;
  }
  if (largo < LARGO_MIN || largo > LARGO_MAX) {
    return `El largo debe estar entre ${LARGO_MIN} y ${LARGO_MAX} mm`;
  }
  return null;
}

function usuarioLimpio(v) {
  return String(v || '').trim().slice(0, 150);
}

function errorDuplicado(ancho, largo) {
  return new HttpError(409, {
    error: 'duplicado',
    mensaje: `Ya existe una etiqueta de ${ancho} × ${largo} mm en este inventario.`,
  });
}

// ¿Ya existe ese ancho/largo en el inventario? (`excluirId` ignora el propio registro al editar)
async function existeTamanio(db, idInventario, ancho, largo, excluirId = null) {
  const r = await db.query(
    `SELECT 1
       FROM etiqueta_tamanio
      WHERE id_inventario = $1
        AND ancho = $2
        AND largo = $3
        AND estado = TRUE
        AND ($4::int IS NULL OR id_etiqueta_tamanio <> $4::int)
      LIMIT 1`,
    [idInventario, ancho, largo, excluirId]
  );
  return r.rowCount > 0;
}

// Evita condiciones de carrera por inventario (dos usuarios creando lo mismo a la vez)
async function bloquearInventario(client, idInventario) {
  await client.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [
    LOCK_NS,
    idInventario,
  ]);
}

// Si el inventario aún no tiene tamaños, crea el 100 x 60 como predeterminado.
// Debe llamarse dentro de una transacción.
async function asegurarPredeterminado(client, idInventario) {
  await bloquearInventario(client, idInventario);
  const r = await client.query(
    'SELECT 1 FROM etiqueta_tamanio WHERE id_inventario = $1 LIMIT 1',
    [idInventario]
  );
  if (r.rowCount === 0) {
    await client.query(
      `INSERT INTO etiqueta_tamanio
         (id_inventario, ancho, largo, usuario_creacion, usuario_modificacion, estado, predeterminado)
       VALUES ($1, $2, $3, 'sistema', 'sistema', TRUE, TRUE)`,
      [idInventario, DEFAULT_ANCHO, DEFAULT_LARGO]
    );
  }
}

async function conTransaccion(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

function responderError(res, ruta, error) {
  if (error instanceof HttpError) {
    return res.status(error.status).json(error.body);
  }
  if (error.code === '23505') {
    return res.status(409).json({
      error: 'duplicado',
      mensaje: 'Ya existe una etiqueta con ese ancho y largo en este inventario.',
    });
  }
  if (error.code === '23503') {
    return res.status(400).json({ error: 'Inventario inválido' });
  }
  console.error(`Error en ${ruta}:`, error);
  // 'detalle' ayuda a depurar; quítalo cuando todo funcione en producción
  return res
    .status(500)
    .json({ error: 'Error interno del servidor', detalle: error.message });
}

// ═══════════════════════════════════════════════════════════════
//  RUTAS  (montar en: app.use('/api/etiqueta-tamanio', router))
// ═══════════════════════════════════════════════════════════════

// 0. ¿Ya existe ese tamaño en el inventario?
// GET /api/etiqueta-tamanio/existe?id_inventario=1&ancho=100&largo=60&excluir_id=5
router.get('/existe', async (req, res) => {
  try {
    const idInventario = aEntero(req.query.id_inventario);
    const ancho = aEntero(req.query.ancho);
    const largo = aEntero(req.query.largo);
    const excluirId = aEntero(req.query.excluir_id);

    if (idInventario === null || ancho === null || largo === null) {
      return res
        .status(400)
        .json({ error: 'id_inventario, ancho y largo son requeridos' });
    }

    const existe = await existeTamanio(pool, idInventario, ancho, largo, excluirId);
    return res.json({ existe });
  } catch (error) {
    return responderError(res, 'GET /api/etiqueta-tamanio/existe', error);
  }
});

// 1. Listar tamaños activos del inventario (crea el 100 x 60 si no hay ninguno)
// GET /api/etiqueta-tamanio/inventario/:id_inventario
router.get('/inventario/:id_inventario', async (req, res) => {
  try {
    const idInventario = aEntero(req.params.id_inventario);
    if (idInventario === null) {
      return res.status(400).json({ error: 'id_inventario inválido' });
    }

    const filas = await conTransaccion(async (c) => {
      await asegurarPredeterminado(c, idInventario);
      const r = await c.query(
        `SELECT ${COLS}
           FROM etiqueta_tamanio
          WHERE id_inventario = $1 AND estado = TRUE
          ORDER BY ancho, largo`,
        [idInventario]
      );
      return r.rows;
    });

    res.json(filas);
  } catch (error) {
    return responderError(res, 'GET /api/etiqueta-tamanio/inventario/:id', error);
  }
});

// 2. Obtener el predeterminado del inventario
// GET /api/etiqueta-tamanio/predeterminado/:id_inventario
router.get('/predeterminado/:id_inventario', async (req, res) => {
  try {
    const idInventario = aEntero(req.params.id_inventario);
    if (idInventario === null) {
      return res.status(400).json({ error: 'id_inventario inválido' });
    }

    const fila = await conTransaccion(async (c) => {
      await asegurarPredeterminado(c, idInventario);
      const r = await c.query(
        `SELECT ${COLS}
           FROM etiqueta_tamanio
          WHERE id_inventario = $1 AND estado = TRUE AND predeterminado = TRUE
          LIMIT 1`,
        [idInventario]
      );
      return r.rows[0] || null;
    });

    if (!fila) return res.status(404).json({ error: 'Sin predeterminado' });
    res.json(fila);
  } catch (error) {
    return responderError(res, 'GET /api/etiqueta-tamanio/predeterminado/:id', error);
  }
});

// 3. Crear un tamaño
// POST /api/etiqueta-tamanio   { id_inventario, ancho, largo, usuario }
router.post('/', async (req, res) => {
  try {
    const idInventario = aEntero(req.body.id_inventario);
    const ancho = aEntero(req.body.ancho);
    const largo = aEntero(req.body.largo);
    const usuario = usuarioLimpio(req.body.usuario);

    if (idInventario === null) {
      return res.status(400).json({ error: 'id_inventario es requerido' });
    }
    if (!usuario) {
      return res.status(400).json({ error: 'usuario es requerido' });
    }
    const errMedidas = validarMedidas(ancho, largo);
    if (errMedidas) return res.status(400).json({ error: errMedidas });

    const fila = await conTransaccion(async (c) => {
      await asegurarPredeterminado(c, idInventario); // también bloquea el inventario

      // 🚫 Duplicado (ancho + largo + inventario)
      if (await existeTamanio(c, idInventario, ancho, largo)) {
        throw errorDuplicado(ancho, largo);
      }

      const r = await c.query(
        `INSERT INTO etiqueta_tamanio
           (id_inventario, ancho, largo, usuario_creacion, usuario_modificacion, estado, predeterminado)
         VALUES ($1, $2, $3, $4, $4, TRUE, FALSE)
         RETURNING ${COLS}`,
        [idInventario, ancho, largo, usuario]
      );
      return r.rows[0];
    });

    res.status(201).json(fila);
  } catch (error) {
    return responderError(res, 'POST /api/etiqueta-tamanio', error);
  }
});

// 4. Editar medidas de un tamaño
// PUT /api/etiqueta-tamanio/:id   { ancho, largo, usuario }
router.put('/:id', async (req, res) => {
  try {
    const id = aEntero(req.params.id);
    const ancho = aEntero(req.body.ancho);
    const largo = aEntero(req.body.largo);
    const usuario = usuarioLimpio(req.body.usuario);

    if (id === null) return res.status(400).json({ error: 'id inválido' });
    if (!usuario) return res.status(400).json({ error: 'usuario es requerido' });
    const errMedidas = validarMedidas(ancho, largo);
    if (errMedidas) return res.status(400).json({ error: errMedidas });

    const fila = await conTransaccion(async (c) => {
      const actual = await c.query(
        'SELECT id_inventario FROM etiqueta_tamanio WHERE id_etiqueta_tamanio = $1 AND estado = TRUE',
        [id]
      );
      if (actual.rowCount === 0) {
        throw new HttpError(404, { error: 'Tamaño no encontrado' });
      }
      const idInventario = actual.rows[0].id_inventario;
      await bloquearInventario(c, idInventario);

      // 🚫 Duplicado contra OTROS registros del mismo inventario
      if (await existeTamanio(c, idInventario, ancho, largo, id)) {
        throw errorDuplicado(ancho, largo);
      }

      const r = await c.query(
        `UPDATE etiqueta_tamanio
            SET ancho = $2,
                largo = $3,
                usuario_modificacion = $4,
                fecha_modificacion = NOW()
          WHERE id_etiqueta_tamanio = $1 AND estado = TRUE
          RETURNING ${COLS}`,
        [id, ancho, largo, usuario]
      );
      if (r.rowCount === 0) {
        throw new HttpError(404, { error: 'Tamaño no encontrado' });
      }
      return r.rows[0];
    });

    res.json(fila);
  } catch (error) {
    return responderError(res, 'PUT /api/etiqueta-tamanio/:id', error);
  }
});

// 5. Marcar como predeterminado (desmarca el anterior del mismo inventario)
// PUT /api/etiqueta-tamanio/:id/predeterminado   { usuario }
router.put('/:id/predeterminado', async (req, res) => {
  try {
    const id = aEntero(req.params.id);
    const usuario = usuarioLimpio(req.body.usuario);

    if (id === null) return res.status(400).json({ error: 'id inválido' });
    if (!usuario) return res.status(400).json({ error: 'usuario es requerido' });

    const fila = await conTransaccion(async (c) => {
      const actual = await c.query(
        'SELECT id_inventario FROM etiqueta_tamanio WHERE id_etiqueta_tamanio = $1 AND estado = TRUE',
        [id]
      );
      if (actual.rowCount === 0) {
        throw new HttpError(404, { error: 'Tamaño no encontrado' });
      }
      const idInventario = actual.rows[0].id_inventario;
      await bloquearInventario(c, idInventario);

      // Primero quitamos el anterior (índice único parcial)
      await c.query(
        `UPDATE etiqueta_tamanio
            SET predeterminado = FALSE,
                usuario_modificacion = $2,
                fecha_modificacion = NOW()
          WHERE id_inventario = $1 AND estado = TRUE AND predeterminado = TRUE
            AND id_etiqueta_tamanio <> $3`,
        [idInventario, usuario, id]
      );

      const r = await c.query(
        `UPDATE etiqueta_tamanio
            SET predeterminado = TRUE,
                usuario_modificacion = $2,
                fecha_modificacion = NOW()
          WHERE id_etiqueta_tamanio = $1 AND estado = TRUE
          RETURNING ${COLS}`,
        [id, usuario]
      );
      return r.rows[0];
    });

    res.json(fila);
  } catch (error) {
    return responderError(res, 'PUT /api/etiqueta-tamanio/:id/predeterminado', error);
  }
});

// 6. Eliminar (borrado lógico: estado = false). El predeterminado no se puede eliminar.
// DELETE /api/etiqueta-tamanio/:id?usuario=correo@gmail.com
router.delete('/:id', async (req, res) => {
  try {
    const id = aEntero(req.params.id);
    const usuario = usuarioLimpio(req.query.usuario || (req.body && req.body.usuario));

    if (id === null) return res.status(400).json({ error: 'id inválido' });
    if (!usuario) return res.status(400).json({ error: 'usuario es requerido' });

    await conTransaccion(async (c) => {
      const actual = await c.query(
        `SELECT id_inventario, predeterminado
           FROM etiqueta_tamanio
          WHERE id_etiqueta_tamanio = $1 AND estado = TRUE`,
        [id]
      );
      if (actual.rowCount === 0) {
        throw new HttpError(404, { error: 'Tamaño no encontrado' });
      }
      await bloquearInventario(c, actual.rows[0].id_inventario);

      if (actual.rows[0].predeterminado) {
        throw new HttpError(409, {
          error: 'predeterminado',
          mensaje:
            'No puedes eliminar el tamaño predeterminado. Marca otro como predeterminado primero.',
        });
      }

      await c.query(
        `UPDATE etiqueta_tamanio
            SET estado = FALSE,
                predeterminado = FALSE,
                usuario_modificacion = $2,
                fecha_modificacion = NOW()
          WHERE id_etiqueta_tamanio = $1`,
        [id, usuario]
      );
    });

    res.json({ mensaje: 'Tamaño eliminado correctamente' });
  } catch (error) {
    return responderError(res, 'DELETE /api/etiqueta-tamanio/:id', error);
  }
});

module.exports = router;