import { io } from "socket.io-client";

const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const fallbackApiUrl = import.meta.env.PROD
    ? `${protocol}//${hostname}/api`
    : `${protocol}//${hostname}:3000/api`;
const apiUrl = import.meta.env.VITE_API_URL || fallbackApiUrl;
const SOCKET_URL = new globalThis.URL(apiUrl).origin;

export const socket = io(SOCKET_URL, {
    autoConnect: true,
});

export interface SocketJoinAcknowledgement {
    ok: boolean;
    protocolVersion: number;
    code?: 'SOCKET_AUTHORIZATION_FAILED';
}

export const joinAdminRoom = (acknowledge?: (result: SocketJoinAcknowledgement) => void) => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    socket.emit("join-admin", { token }, acknowledge);
};

export const joinMenuRoom = (adminId: string) => {
    socket.emit("join-menu", adminId);
};

export const joinOrderRoom = (
    orderId: number,
    trackingToken: string,
    acknowledge?: (result: SocketJoinAcknowledgement) => void,
) => {
    socket.emit("join-order", { orderId, trackingToken }, acknowledge);
};
