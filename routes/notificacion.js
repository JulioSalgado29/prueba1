const express = require('express');
const router = express.Router();
const pool = require('../db'); 
const admin = require('firebase-admin');

// 1. Guardar o actualizar el Token FCM del dispositivo del Administrador
router.post('/token', async (req, res) => {
    console.log('📥 [Backend] POST /api/notificaciones/token - Solicitud recibida');
    console.log('📦 [Backend] Body recibido:', req.body);

    const { email_usuario, fcm_token } = req.body;

    if (!email_usuario || !fcm_token || fcm_token.trim() === '') {
        console.log('⚠️ [Backend] Validación fallida en /token: Faltan campos obligatorios');
        return res.status(400).json({ error: 'Faltan campos obligatorios (email o token)' });
    }

    const emailLimpio = email_usuario.trim().toLowerCase();
    console.log(`🔍 [Backend] Buscando usuario para token con email: ${emailLimpio}`);

    try {
        const userQuery = await pool.query(
            `SELECT u.id_usuario, u.email, r.nombre_rol 
             FROM usuario u 
             JOIN usuario_rol r ON u.id_usuario_rol = r.id_usuario_rol 
             WHERE LOWER(u.email) = $1`,
            [emailLimpio]
        );

        if (userQuery.rows.length === 0) {
            console.log(`❌ [Backend] Usuario no encontrado en base de datos para token: ${emailLimpio}`);
            return res.status(404).json({ error: 'Usuario no encontrado en el sistema' });
        }

        const usuario = userQuery.rows[0];
        console.log(`✅ [Backend] Usuario encontrado (ID: ${usuario.id_usuario}, Rol: ${usuario.nombre_rol}). Actualizando token FCM...`);

        const resultado = await pool.query(
            `UPDATE usuario 
             SET fcm_token = $1 
             WHERE id_usuario = $2 
             RETURNING id_usuario, email, nombre, fcm_token`,
            [fcm_token.trim(), usuario.id_usuario]
        );

        console.log(`🎉 [Backend] Token FCM actualizado exitosamente para el usuario ID: ${usuario.id_usuario}`);

        res.status(200).json({
            mensaje: 'Token FCM registrado correctamente',
            data: resultado.rows[0],
        });

    } catch (error) {
        console.error('🔥 [Backend] Error crítico en POST /api/notificaciones/token:', error.message);
        console.error(error.stack);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 2. Disparar notificación de nueva venta a los administradores y almaceneros del mismo inventario
router.post('/enviar-venta', async (req, res) => {
    console.log('📥 [Backend] POST /api/notificaciones/enviar-venta - Solicitud recibida');
    console.log('📦 [Backend] Body recibido:', req.body);

    const { id_inventario, email_usuario, total_venta } = req.body;

    if (!id_inventario || !email_usuario || total_venta === undefined) {
        console.log('⚠️ [Backend] Validación fallida en /enviar-venta: Faltan campos obligatorios');
        return res.status(400).json({ error: 'Faltan campos obligatorios (id_inventario, email_usuario o total_venta)' });
    }

    const emailLimpio = email_usuario.trim().toLowerCase();
    console.log(`🔍 [Backend] Procesando venta para inventario ID: ${id_inventario} realizada por: ${emailLimpio}`);

    try {
        const usuarioVentaQuery = await pool.query(
            `SELECT nombre FROM usuario WHERE LOWER(email) = $1`,
            [emailLimpio]
        );

        const nombreVendedor = usuarioVentaQuery.rows.length > 0
            ? usuarioVentaQuery.rows[0].nombre
                ? usuarioVentaQuery.rows[0].nombre.split(' ')[0] 
                : 'Un usuario'
            : 'Un usuario';
        
        console.log(`👤 [Backend] Vendedor identificado: ${nombreVendedor}`);

        const queryDestinatarios = `
      SELECT u.id_usuario, u.email, u.fcm_token 
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
        const tokensDestinatarios = resultado.rows.map(row => row.fcm_token);

        console.log(`🎯 [Backend] Tokens destinatarios encontrados: ${tokensDestinatarios.length}`);

        if (tokensDestinatarios.length === 0) {
            console.log('ℹ️ [Backend] No hay otros administradores o almaceneros con token activo en este inventario.');
            return res.status(200).json({ mensaje: 'No hay otros administradores o almaceneros con token activo en este inventario.' });
        }

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

        console.log('🚀 [Backend] Enviando notificaciones mediante Firebase Cloud Messaging...');
        
        // Uso seguro del servicio de mensajería compatible con versiones modernas de firebase-admin
        const messaging = admin.messaging();
        const respuestaAdmin = await messaging.sendEachForMulticast(mensaje);
        
        console.log(`✅ [Backend] Firebase envió las notificaciones. Exitosas: ${respuestaAdmin.successCount}, Fallidas: ${respuestaAdmin.failureCount}`);

        res.status(200).json({
            mensaje: 'Proceso de notificación finalizado',
            exitosas: respuestaAdmin.successCount,
            fallidas: respuestaAdmin.failureCount,
        });

    } catch (error) {
        console.error('🔥 [Backend] Error crítico en POST /api/notificaciones/enviar-venta:', error.message);
        console.error(error.stack);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;