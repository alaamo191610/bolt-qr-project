import { io } from "socket.io-client";

// In production, this should match your backend URL
const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const URL = `http://${hostname}:3000`;

export const socket = io(URL, {
    autoConnect: true,
});

export const joinAdminRoom = (adminId: string) => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    socket.emit("join-admin", { adminId, token });
};

export const joinMenuRoom = (adminId: string) => {
    socket.emit("join-menu", adminId);
};

export const joinOrderRoom = (orderId: number) => {
    socket.emit("join-order", orderId);
};
