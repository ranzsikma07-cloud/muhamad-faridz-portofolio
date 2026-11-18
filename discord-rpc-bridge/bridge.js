const RPC = require('discord-rpc');
const WebSocket = require('ws');

const clientId = '1572084310696005723';
const rpc = new RPC.Client({ transport: 'ipc' });
const wss = new WebSocket.Server({ port: 8080 });

let isRpcReady = false;

rpc.on('ready', () => {
    isRpcReady = true;
    console.log('✅ Terhubung ke Discord Desktop!');
});

wss.on('connection', (ws) => {
    console.log('🌐 Website portofolio terhubung via WebSocket!');

    // Langsung set activity default saat website dibuka
    if (isRpcReady) {
        rpc.setActivity({
            details: 'Sedang ngoding',
            state: 'Web Portofolio',
            startTimestamp: new Date(),
            largeImageKey: 'gojo',
            largeImageText: 'my portofolio',
            instance: false,
        });
        console.log('🚀 Status Discord berhasil diperbarui!');
    }

    ws.on('message', (message) => {
        if (!isRpcReady) return;
        try {
            const data = JSON.parse(message);
            rpc.setActivity({
                details: data.details, // Mengambil langsung dari website
                state: data.state,     // Mengambil langsung dari website
                startTimestamp: new Date(),
                largeImageKey: 'gojo',
                largeImageText: 'NAH I\'D WIN',
                instance: false,
            });
            console.log('🚀 Status Discord diubah ke:', data.details, '|', data.state);
        } catch (e) {
            console.log('Gagal parse pesan WebSocket');
        }
    });

    ws.on('close', () => {
        console.log('❌ Koneksi website ditutup.');
    });
});

rpc.login({ clientId }).catch(console.error);