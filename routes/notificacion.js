const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta a tu conexión 'db' según la ubicación de tus carpetas
const admin = require('firebase-admin'); // Asegúrate de tener configurado firebase-admin en tu proyecto

// 1. Guardar o actualizar el Token FCM del dispositivo del Administrador
// Petición: POST /api/notificaciones/token
router.post('/token', async (req, res) => {
    const { email_usuario, fcm_token } = req.body;

    // 1. Validación rápida obligatoria
    if (!email_usuario || !fcm_token || fcm_token.trim() === '') {
        return res.status(400).json({ error: 'Faltan campos obligatorios (email o token)' });
    }

    const emailLimpio = email_usuario.trim().toLowerCase();

    try {
        // 2. Verificar que el usuario exista en el sistema (sin restringir el rol aquí)
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

        // 3. Actualizar el token FCM en la tabla usuario para CUALQUIER rol que haya iniciado sesión
        const resultado = await pool.query(
            `UPDATE usuario 
             SET fcm_token = $1 
             WHERE id_usuario = $2 
             RETURNING id_usuario, email, nombre, fcm_token`,
            [fcm_token.trim(), usuario.id_usuario]
        );

        res.status(200).json({
            mensaje: 'Token FCM registrado correctamente',
            data: resultado.rows[0],
        });

    } catch (error) {
        console.error('Error en POST /api/notificaciones/token:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 2. Disparar notificación de nueva venta a los administradores y almaceneros del mismo inventario
// Petición: POST /api/notificaciones/enviar-venta
router.post('/enviar-venta', async (req, res) => {
    const { id_inventario, email_usuario, total_venta } = req.body;

    if (!id_inventario || !email_usuario || total_venta === undefined) {
        return res.status(400).json({ error: 'Faltan campos obligatorios (id_inventario, email_usuario o total_venta)' });
    }

    const emailLimpio = email_usuario.trim().toLowerCase();

    try {
        // 1. Obtener el nombre del usuario que realizó la venta
        const usuarioVentaQuery = await pool.query(
            `SELECT nombre FROM usuario WHERE LOWER(email) = $1`,
            [emailLimpio]
        );

        const nombreVendedor = usuarioVentaQuery.rows.length > 0
            ? usuarioVentaQuery.rows[0].nombre
                ? usuarioVentaQuery.rows[0].nombre.split(' ')[0] // Opcional: solo el primer nombre
                : 'Un usuario'
            : 'Un usuario';

        // 2. Buscar los tokens FCM de Administradores y Almaceneros del MISMO INVENTARIO (excluyendo al emisor)
        const queryDestinatarios = `
      SELECT u.id_usuario, u.email, u.fcm_token 
      FROM usuario u 
      JOIN usuario_rol r ON u.id_usuario_rol = r.id_usuario_rol 
      WHERE r.nombre_rol IN ('Administrador', 'Almacenero') 
        AND LOWER(u.email) != $1
        AND u.fcm_token IS NOT NULL
        AND u.fcm_token != ''
        AND u.id_inventario = $2
    `;

        const resultado = await pool.query(queryDestinatarios, [emailLimpio, id_inventario]);
        const tokensDestinatarios = resultado.rows.map(row => row.fcm_token);

        if (tokensDestinatarios.length === 0) {
            return res.status(200).json({ mensaje: 'No hay otros administradores o almaceneros con token activo en este inventario.' });
        }

        // 3. Estructurar el mensaje incluyendo el nombre del vendedor
        const mensaje = {
            notification: {
                title: '¡Nueva Venta Registrada! 💰',
                body: `${nombreVendedor} registró una venta por S/ ${total_venta}.`,
            },
            tokens: tokensDestinatarios,
            android: {
                notification: {
                    sound: 'alerta_calza_app',
                    priority: 'high',
                    defaultSound: false,
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'alerta_calza_app.wav',
                        badge: 1,
                    },
                },
            },
        };

        const respuestaAdmin = await admin.messaging().sendEachForMulticast(mensaje);

        res.status(200).json({
            mensaje: 'Proceso de notificación finalizado',
            exitosas: respuestaAdmin.successCount,
            fallidas: respuestaAdmin.failureCount,
        });

    } catch (error) {
        console.error('Error en POST /api/notificaciones/enviar-venta:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;