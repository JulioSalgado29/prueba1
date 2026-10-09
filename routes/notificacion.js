const express = require('express');
const router = express.Router();
const pool = require('../db');
const { messaging } = require('../firebase'); // <-- Importación centralizada del servicio FCM

// 1. Guardar o actualizar el Token FCM del dispositivo del Administrador
// Petición: POST /api/notificaciones/token
router.post('/token', async (req, res) => {
    console.log('📥 [Backend] POST /api/notificaciones/token - Solicitud recibida');
    console.log('📦 [Backend] Body recibido:', req.body);

    const { email_usuario, fcm_token } = req.body;

    // 1. Validación rápida obligatoria
    if (!email_usuario || !fcm_token || fcm_token.trim() === '') {
        console.log('⚠️ [Backend] Validación fallida en /token: Faltan campos obligatorios');
        return res.status(400).json({ error: 'Faltan campos obligatorios (email o token)' });
    }

    const emailLimpio = email_usuario.trim().toLowerCase();
    const tokenLimpio = fcm_token.trim();
    console.log(`🔍 [Backend] Buscando usuario para token con email: ${emailLimpio}`);

    try {
        // 2. Verificar que el usuario exista en el sistema
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

        // 3. Limpiar el token si lo tenía otro usuario (excepto el actual)
        const clearResult = await pool.query(
            `UPDATE usuario 
             SET fcm_token = NULL 
             WHERE fcm_token = $1 AND id_usuario <> $2`,
            [tokenLimpio, usuario.id_usuario]
        );

        console.log(`🧹 [Backend] Limpieza de token previo. Filas afectadas en otros usuarios: ${clearResult.rowCount}`);

        // 4. Actualizar o asignar el token FCM al usuario actual
        const resultado = await pool.query(
            `UPDATE usuario 
             SET fcm_token = $1 
             WHERE id_usuario = $2 
             RETURNING id_usuario, email, nombre, fcm_token`,
            [tokenLimpio, usuario.id_usuario]
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
// POST /api/notificaciones/enviar-venta
router.post('/enviar-venta', async (req, res) => {
    console.log('📥 [Backend] POST /api/notificaciones/enviar-venta - Solicitud recibida');
    console.log('📦 [Backend] Body recibido:', req.body);

    const { id_inventario, email_usuario, total_venta } = req.body;

    if (!id_inventario || !email_usuario || total_venta === undefined) {
        console.log('⚠️ [Backend] Validación fallida: faltan campos obligatorios');
        return res.status(400).json({ error: 'Faltan campos obligatorios (id_inventario, email_usuario o total_venta)' });
    }

    const emailLimpio = email_usuario.trim().toLowerCase();
    console.log(`🔍 [Backend] Procesando venta para inventario ID: ${id_inventario} realizada por: ${emailLimpio}`);

    try {
        // 1. Nombre del vendedor
        const usuarioVentaQuery = await pool.query(
            `SELECT nombre FROM usuario WHERE LOWER(email) = $1`,
            [emailLimpio]
        );

        const nombreVendedor = usuarioVentaQuery.rows.length > 0 && usuarioVentaQuery.rows[0].nombre
            ? usuarioVentaQuery.rows[0].nombre.split(' ')[0]
            : 'Un usuario';

        console.log(`👤 [Backend] Vendedor identificado: ${nombreVendedor}`);

        // 2. Tokens de Administradores y Almaceneros del mismo inventario (excluyendo al emisor)
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
        const destinatarios = resultado.rows;
        const tokensDestinatarios = destinatarios.map(row => row.fcm_token);

        console.log(`🎯 [Backend] Tokens destinatarios encontrados: ${tokensDestinatarios.length}`);

        if (tokensDestinatarios.length === 0) {
            return res.status(200).json({ mensaje: 'No hay otros administradores o almaceneros con token activo en este inventario.' });
        }

        const titulo = '¡Nueva Venta Registrada! 💰';
        const cuerpo = `${nombreVendedor} registró una venta por S/ ${total_venta}.`;

        const mensaje = {
            // ✅ "notification": el sistema Android/iOS la muestra aunque la app esté cerrada
            notification: {
                title: titulo,
                body: cuerpo,
            },
            // "data": opcional, para lógica extra en la app (todos los valores deben ser String)
            data: {
                tipo: 'venta',
                id_inventario: String(id_inventario),
                total_venta: String(total_venta),
            },
            tokens: tokensDestinatarios,
            android: {
                priority: 'high',
                notification: {
                    channelId: 'canal_calza_app_final', // IGUAL que kCanalId en Flutter
                    sound: 'alerta_calza_app',       // res/raw/alerta_calza_app.mp3 (sin extensión)
                },
            },
            apns: {
                headers: { 'apns-priority': '10' },
                payload: {
                    aps: {
                        sound: 'alerta_calza_app.mp3', // debe estar en el bundle de iOS
                        badge: 1,
                    },
                },
            },
        };

        console.log('🚀 [Backend] Enviando notificaciones mediante Firebase Cloud Messaging...');
        const respuestaAdmin = await messaging.sendEachForMulticast(mensaje);

        console.log(`✅ [Backend] Exitosas: ${respuestaAdmin.successCount}, Fallidas: ${respuestaAdmin.failureCount}`);

        // 3. Log de errores + limpieza de tokens inválidos
        const tokensInvalidos = [];
        respuestaAdmin.responses.forEach((resp, idx) => {
            if (!resp.success) {
                const code = resp.error?.code;
                console.error(`❌ [Backend] Token fallido (${destinatarios[idx].email}): ${code} - ${resp.error?.message}`);
                if (
                    code === 'messaging/registration-token-not-registered' ||
                    code === 'messaging/invalid-registration-token'
                ) {
                    tokensInvalidos.push(tokensDestinatarios[idx]);
                }
            }
        });

        if (tokensInvalidos.length > 0) {
            await pool.query(
                `UPDATE usuario SET fcm_token = NULL WHERE fcm_token = ANY($1::text[])`,
                [tokensInvalidos]
            );
            console.log(`🧹 [Backend] Tokens inválidos eliminados: ${tokensInvalidos.length}`);
        }

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