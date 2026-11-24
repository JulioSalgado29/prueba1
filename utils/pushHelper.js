// utils/pushHelper.js
// Envía un push a varios usuarios con el badge CORRECTO por usuario.
// Úsalo en TODOS los lugares donde envíes notificaciones (ventas, movimientos, etc.)
const pool = require('../db');
const { messaging } = require('../firebase');

/**
 * @param {Array<{id_usuario:any, email:string, fcm_token:string}>} destinatarios
 * @param {{titulo:string, cuerpo:string, data?:Object}} contenido
 */
async function enviarPushConBadge(destinatarios, { titulo, cuerpo, data = {} }) {
    if (!destinatarios || destinatarios.length === 0) {
        return { successCount: 0, failureCount: 0 };
    }

    // 1. Sumar +1 pendiente a cada destinatario (atómico) y obtener su total actual
    const ids = destinatarios.map((d) => d.id_usuario);
    const upd = await pool.query(
        `UPDATE usuario
            SET badge_pendientes = COALESCE(badge_pendientes, 0) + 1
          WHERE id_usuario = ANY($1)
        RETURNING id_usuario, badge_pendientes`,
        [ids]
    );
    const badgePorUsuario = {};
    upd.rows.forEach((r) => {
        badgePorUsuario[String(r.id_usuario)] = r.badge_pendientes;
    });

    // 2. Un mensaje por usuario (cada uno con su propio badge)
    const dataStr = {};
    Object.entries(data).forEach(([k, v]) => (dataStr[k] = String(v)));

    const mensajes = destinatarios.map((d) => ({
        token: d.fcm_token,
        notification: { title: titulo, body: cuerpo },
        data: dataStr,
        android: {
            priority: 'high',
            notification: {
                channelId: 'canal_calza_app_final', // IGUAL que kCanalId en Flutter
                sound: 'alerta_calza_app',
            },
        },
        apns: {
            headers: { 'apns-priority': '10' },
            payload: {
                aps: {
                    sound: 'alerta_calza_app.wav',
                    badge: badgePorUsuario[String(d.id_usuario)] || 1,
                },
            },
        },
    }));

    const respuesta = await messaging.sendEach(mensajes);

    // 3. Limpiar tokens inválidos
    const tokensInvalidos = [];
    respuesta.responses.forEach((resp, idx) => {
        if (!resp.success) {
            const code = resp.error?.code;
            console.error(`❌ [Push] Falló (${destinatarios[idx].email}): ${code} - ${resp.error?.message}`);
            if (
                code === 'messaging/registration-token-not-registered' ||
                code === 'messaging/invalid-registration-token'
            ) {
                tokensInvalidos.push(destinatarios[idx].fcm_token);
            }
        }
    });

    if (tokensInvalidos.length > 0) {
        await pool.query(
            `UPDATE usuario SET fcm_token = NULL WHERE fcm_token = ANY($1::text[])`,
            [tokensInvalidos]
        );
        console.log(`🧹 [Push] Tokens inválidos eliminados: ${tokensInvalidos.length}`);
    }

    return {
        successCount: respuesta.successCount,
        failureCount: respuesta.failureCount,
    };
}

module.exports = { enviarPushConBadge };