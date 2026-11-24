const express = require('express');
const router = express.Router();
const pool = require('../db');
const { enviarPushConBadge } = require('../utils/pushHelper'); // ✅ NUEVO

// 1. Guardar o actualizar el Token FCM del dispositivo
// POST /api/notificaciones/token
router.post('/token', async (req, res) => {
    console.log('📥 [Backend] POST /api/notificaciones/token - Solicitud recibida');

    const { email_usuario, fcm_token } = req.body;

    if (!email_usuario || !fcm_token || fcm_token.trim() === '') {
        return res.status(400).json({ error: 'Faltan campos obligatorios (email o token)' });
    }

    const emailLimpio = email_usuario.trim().toLowerCase();
    const tokenLimpio = fcm_token.trim();

    try {
        const userQuery = await pool.query(
            `SELECT u.id_usuario, u.email, r.nombre_rol 
             FROM usuario u 
             JOIN usuario_rol r ON u.id_usuario_rol = r.id_usuario_rol 
             WHERE LOWER(u.email) = $1`,
            [emailLimpio]
        );

        if (userQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado en el sistema' });
        }

        const usuario = userQuery.rows[0];

        // Limpiar el token si lo tenía otro usuario
        await pool.query(
            `UPDATE usuario SET fcm_token = NULL 
             WHERE fcm_token = $1 AND id_usuario <> $2`,
            [tokenLimpio, usuario.id_usuario]
        );

        const resultado = await pool.query(
            `UPDATE usuario SET fcm_token = $1 
             WHERE id_usuario = $2 
             RETURNING id_usuario, email, nombre, fcm_token, badge_pendientes`,
            [tokenLimpio, usuario.id_usuario]
        );

        res.status(200).json({
            mensaje: 'Token FCM registrado correctamente',
            data: resultado.rows[0],
        });
    } catch (error) {
        console.error('🔥 [Backend] Error en POST /token:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ✅ NUEVO: Quitar el token al cerrar sesión (evita pushes a quien ya salió)
// POST /api/notificaciones/token/eliminar
router.post('/token/eliminar', async (req, res) => {
    const { email_usuario } = req.body;
    if (!email_usuario) {
        return res.status(400).json({ error: 'Falta email_usuario' });
    }
    try {
        await pool.query(
            `UPDATE usuario SET fcm_token = NULL, badge_pendientes = 0
             WHERE LOWER(email) = $1`,
            [email_usuario.trim().toLowerCase()]
        );
        res.status(200).json({ mensaje: 'Token eliminado' });
    } catch (error) {
        console.error('🔥 [Backend] Error en POST /token/eliminar:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ✅ Sincronizar el contador de pendientes (la app envía cuántas siguen en el iPhone)
// POST /api/notificaciones/leidas   body: { email_usuario, pendientes? }  (por defecto 0)
router.post('/leidas', async (req, res) => {
    const { email_usuario } = req.body;
    if (!email_usuario) {
        return res.status(400).json({ error: 'Falta email_usuario' });
    }
    const pendientes = Math.max(0, parseInt(req.body.pendientes, 10) || 0);
    try {
        const r = await pool.query(
            `UPDATE usuario SET badge_pendientes = $2
             WHERE LOWER(email) = $1
             RETURNING badge_pendientes`,
            [email_usuario.trim().toLowerCase(), pendientes]
        );
        if (r.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.status(200).json({ pendientes: r.rows[0].badge_pendientes });
    } catch (error) {
        console.error('🔥 [Backend] Error en POST /leidas:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ✅ NUEVO: Consultar cuántas faltan por ver
// GET /api/notificaciones/pendientes?email_usuario=...
router.get('/pendientes', async (req, res) => {
    const email = (req.query.email_usuario || '').toString().trim().toLowerCase();
    if (!email) {
        return res.status(400).json({ error: 'Falta email_usuario' });
    }
    try {
        const r = await pool.query(
            `SELECT COALESCE(badge_pendientes, 0) AS pendientes
             FROM usuario WHERE LOWER(email) = $1`,
            [email]
        );
        res.status(200).json({ pendientes: r.rows[0]?.pendientes ?? 0 });
    } catch (error) {
        console.error('🔥 [Backend] Error en GET /pendientes:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 2. Notificación de nueva venta
// POST /api/notificaciones/enviar-venta
router.post('/enviar-venta', async (req, res) => {
    console.log('📥 [Backend] POST /api/notificaciones/enviar-venta - Solicitud recibida');

    const { id_inventario, email_usuario, total_venta } = req.body;

    if (!id_inventario || !email_usuario || total_venta === undefined) {
        return res.status(400).json({ error: 'Faltan campos obligatorios (id_inventario, email_usuario o total_venta)' });
    }

    const emailLimpio = email_usuario.trim().toLowerCase();

    try {
        const usuarioVentaQuery = await pool.query(
            `SELECT nombre FROM usuario WHERE LOWER(email) = $1`,
            [emailLimpio]
        );

        const nombreVendedor = usuarioVentaQuery.rows.length > 0 && usuarioVentaQuery.rows[0].nombre
            ? usuarioVentaQuery.rows[0].nombre.split(' ')[0]
            : 'Un usuario';

        const queryDestinatarios = `
            SELECT DISTINCT u.id_usuario, u.email, u.fcm_token
            FROM usuario u
            JOIN usuario_rol r ON u.id_usuario_rol = r.id_usuario_rol
            JOIN inventario i ON u.id_propietario = i.id_propietario
            WHERE r.nombre_rol IN ('Administrador', 'Almacenero')
              AND LOWER(u.email) != $1
              AND u.fcm_token IS NOT NULL
              AND u.fcm_token != ''
              AND i.id_inventario = $2
        `;

        const resultado = await pool.query(queryDestinatarios, [emailLimpio, id_inventario]);
        const destinatarios = resultado.rows;

        if (destinatarios.length === 0) {
            return res.status(200).json({ mensaje: 'No hay otros administradores o almaceneros con token activo en este inventario.' });
        }

        // ✅ CAMBIO: envío con badge individual (ya no es badge: 1 fijo)
        const r = await enviarPushConBadge(destinatarios, {
            titulo: '¡Nueva Venta Registrada! 💰',
            cuerpo: `${nombreVendedor} registró una venta por S/ ${total_venta}.`,
            data: {
                tipo: 'venta',
                id_inventario: id_inventario,
                total_venta: total_venta,
            },
        });

        res.status(200).json({
            mensaje: 'Proceso de notificación finalizado',
            exitosas: r.successCount,
            fallidas: r.failureCount,
        });
    } catch (error) {
        console.error('🔥 [Backend] Error en POST /enviar-venta:', error.message);
        console.error(error.stack);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;