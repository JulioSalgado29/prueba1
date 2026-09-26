const { initializeApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const path = require('path');

// 1. Apuntamos al archivo de credenciales de forma segura
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'serviceAccountKey.json');

// 2. Inicializamos la app limpia de Firebase
let app;
try {
    app = initializeApp();
} catch (error) {
    // Si ya estaba inicializada, la ignoramos y la obtenemos
    const { getApps } = require('firebase-admin/app');
    app = getApps()[0];
}

// 3. Obtenemos el servicio de mensajería de la manera moderna y sin errores
const messaging = getMessaging(app);

module.exports = { messaging };