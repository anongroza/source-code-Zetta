function base64ToUint8Array(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function uint8ArrayToBase64(uint8Array) {
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
}

async function generateKeys() {
    const keyPair = await window.crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256"
        },
        true,
        ["encrypt", "decrypt"]
    );
    const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
    return { publicKey: JSON.stringify(publicKeyJwk), privateKey: JSON.stringify(privateKeyJwk) };
}

async function encryptMessage(publicKeyJwk, message) {
    const publicKey = await window.crypto.subtle.importKey(
        "jwk", JSON.parse(publicKeyJwk),
        { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]
    );
    const aesKey = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedMessage = new TextEncoder().encode(message);
    const encryptedMessage = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv }, aesKey, encodedMessage
    );
    const aesKeyRaw = await window.crypto.subtle.exportKey("raw", aesKey);
    const encryptedAesKey = await window.crypto.subtle.encrypt(
        { name: "RSA-OAEP" }, publicKey, aesKeyRaw
    );
    return JSON.stringify({
        iv: uint8ArrayToBase64(iv),
        encryptedAesKey: uint8ArrayToBase64(new Uint8Array(encryptedAesKey)),
        encryptedMessage: uint8ArrayToBase64(new Uint8Array(encryptedMessage))
    });
}

async function decryptMessage(privateKeyJwk, encryptedDataStr) {
    const privateKey = await window.crypto.subtle.importKey(
        "jwk", JSON.parse(privateKeyJwk),
        { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]
    );
    const data = JSON.parse(encryptedDataStr);
    const encryptedAesKey = base64ToUint8Array(data.encryptedAesKey);
    const iv = base64ToUint8Array(data.iv);
    const encryptedMessage = base64ToUint8Array(data.encryptedMessage);
    const aesKeyRaw = await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" }, privateKey, encryptedAesKey
    );
    const aesKey = await window.crypto.subtle.importKey(
        "raw", aesKeyRaw, { name: "AES-GCM" }, false, ["decrypt"]
    );
    const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv }, aesKey, encryptedMessage
    );
    return new TextDecoder().decode(decrypted);
}

async function encryptFile(publicKeyJwk, file) {
    return new Promise(async (resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const arrayBuffer = e.target.result;
            const publicKey = await window.crypto.subtle.importKey(
                "jwk", JSON.parse(publicKeyJwk),
                { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]
            );
            const aesKey = await window.crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
            );
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encryptedFile = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv }, aesKey, arrayBuffer
            );
            const aesKeyRaw = await window.crypto.subtle.exportKey("raw", aesKey);
            const encryptedAesKey = await window.crypto.subtle.encrypt(
                { name: "RSA-OAEP" }, publicKey, aesKeyRaw
            );
            resolve(JSON.stringify({
                iv: uint8ArrayToBase64(iv),
                encryptedAesKey: uint8ArrayToBase64(new Uint8Array(encryptedAesKey)),
                encryptedFile: uint8ArrayToBase64(new Uint8Array(encryptedFile))
            }));
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

async function decryptFile(privateKeyJwk, encryptedDataStr) {
    const privateKey = await window.crypto.subtle.importKey(
        "jwk", JSON.parse(privateKeyJwk),
        { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]
    );
    const data = JSON.parse(encryptedDataStr);
    const encryptedAesKey = base64ToUint8Array(data.encryptedAesKey);
    const iv = base64ToUint8Array(data.iv);
    const encryptedFile = base64ToUint8Array(data.encryptedFile);
    const aesKeyRaw = await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" }, privateKey, encryptedAesKey
    );
    const aesKey = await window.crypto.subtle.importKey(
        "raw", aesKeyRaw, { name: "AES-GCM" }, false, ["decrypt"]
    );
    const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv }, aesKey, encryptedFile
    );
    return new Blob([decrypted]);
}