const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../db');

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L)
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generarToken(largo = 8) {
  const bytes = crypto.randomBytes(largo);
  let t = '';
  for (let i = 0; i < largo; i++) t += ALFABETO[bytes[i] % ALFABETO.length];
  return `CZ1-${t}`;
}

// POST /api/qr/generar
// body: { id_inventario, combos: [{ id_calzado, id_color, talla, taco, plataforma }] }
// Devuelve el token de cada combo (lo crea si no existe, es idempotente)
router.post('/generar', async (req, res) => {
  const { id_inventario, combos } = req.body;
  if (!id_inventario || !Array.isArray(combos) || combos.length === 0) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = [];

    for (const c of combos) {
      const combo = [
        Number(id_inventario),
        Number(c.id_calzado),
        Number(c.id_color || 0),
        Number(c.talla),
        Number(c.taco || 0),
        String(c.plataforma || '0'),
      ];

      let fila = null;
      for (let intento = 0; intento < 3 && !fila; intento++) {
        try {
          const r = await client.query(
            `INSERT INTO sku_qr
               (id_inventario, id_calzado, id_color, talla, taco, plataforma, token)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (id_inventario, id_calzado, id_color, talla, taco, plataforma)
             DO UPDATE SET activo = sku_qr.activo
             RETURNING token`,
            [...combo, generarToken()]
          );
          fila = r.rows[0];
        } catch (e) {
          if (e.code === '23505' && intento < 2) continue; // colisión de token, reintenta
          throw e;
        }
      }

      resultado.push({
        id_calzado: combo[1], id_color: combo[2], talla: combo[3],
        taco: combo[4], plataforma: combo[5], token: fila.token,
      });
    }

    await client.query('COMMIT');
    res.json(resultado);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('ERROR qr/generar:', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// GET /api/qr/resolver/:token?inventario=ID
router.get('/resolver/:token', async (req, res) => {
  const { token } = req.params;
  const inventario = Number(req.query.inventario);

  if (!/^CZ1-[A-Z0-9]{8}$/.test(token)) {
    return res.status(400).json({ error: 'QR no válido' });
  }

  try {
    const r = await pool.query(
      `SELECT id_inventario, id_calzado, id_color, talla, taco, plataforma
         FROM sku_qr
        WHERE token = $1 AND activo = TRUE`,
      [token]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'QR no encontrado' });

    // Un QR de otro inventario no debe operar en este
    if (inventario && r.rows[0].id_inventario !== inventario) {
      return res.status(403).json({ error: 'El QR pertenece a otro inventario' });
    }
    res.json(r.rows[0]);
  } catch (error) {
    console.error('ERROR qr/resolver:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;