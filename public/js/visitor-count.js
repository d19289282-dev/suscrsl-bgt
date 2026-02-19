// Cliente simple para actualizar el contador de visitantes en tiempo real
(function(){
    // Esperar a que el DOM esté listo
    function ready(fn) {
        if (document.readyState !== 'loading') {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }

    ready(function(){
        if (typeof io === 'undefined') {
            console.warn('Socket.IO cliente no cargado. Asegúrate de que /socket.io/socket.io.js se sirve desde el servidor.');
            return;
        }

        const socket = io();
        const countEl = document.getElementById('visitor-count');

        socket.on('connect', () => {
            // El servidor emitirá el conteo cuando se conecte cualquiera
            // Opcional: pedir directamente el conteo si lo deseas
        });

        socket.on('count', (n) => {
            if (countEl) countEl.textContent = n;
        });

        socket.on('disconnect', () => {
            // Podríamos indicar desconexión brevemente
        });
    });
})();
