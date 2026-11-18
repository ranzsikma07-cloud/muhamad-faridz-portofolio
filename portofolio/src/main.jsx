import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// --- KODE DISCORD RPC WEB CONNECTOR ---
function connectDiscordRPC() {
    const socket = new WebSocket('ws://localhost:8080');

    socket.onopen = () => {
        console.log('Terkoneksi dengan Discord Bridge');
        
        // Beri jeda 1 detik agar bridge siap menerima data
    setTimeout(() => {
    socket.send(JSON.stringify({
        details: 'lagi ngodig jangan ganggu', // <--- Ganti kata-katanya di sini
        state: 'project'     // <--- Ganti sub-statusnya di sini
    }));
    }, 1000);
    };

    socket.onerror = () => {
        console.log('Discord RPC Bridge tidak aktif.');
    };
}

// Jalankan otomatis saat halaman selesai dimuat
window.addEventListener('load', connectDiscordRPC);