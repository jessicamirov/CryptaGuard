import { toast } from "react-toastify";
import {
    encryptText,
    encryptFile,
    decryptText,
    decryptFile,
} from "./encryption";
import sendSound from "../assets/whisper.mp3";
import { Buffer } from "buffer";

let encryptFileCounter = 1;

export const playSendSound = () => {
    const audio = new Audio(sendSound);
    audio.play();
};

export const handleSendMessage = ({
    message,
    connection,
    recipientPeerId,
    messages,
    myWallet,
    peerId,
    setMessages,
    setMessage,
}) => {
    if (message.trim() && connection) {
        const { encrypted, nonce } = encryptText(
            message,
            recipientPeerId,
            myWallet.privateKey
        );
        const encMessage = JSON.stringify({
            messageType: "text",
            encrypted,
            nonce,
        });
        connection.send(encMessage);
        setMessages([
            ...messages,
            { sender: peerId, content: message, type: "text" },
        ]);
        setMessage("");
        playSendSound();
        toast.success("Message sent!");
    }
};

export const handleSendFile = async ({
    e,
    connection,
    recipientPeerId,
    myWallet,
    peerId,
    setMessages,
    messages,
}) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
        const confirmEncrypt = window.confirm(
            "Do you want to encrypt the file before sending?"
        );
        const reader = new FileReader();
        reader.onload = async (event) => {
            const fileBuffer = Buffer.from(event.target.result);
            let encMessage;
            let fileName = selectedFile.name;
            if (confirmEncrypt) {
                fileName = `encrypted${encryptFileCounter++}${fileName.substring(
                    fileName.lastIndexOf(".")
                )}`;
                encMessage = encryptFile(
                    fileBuffer,
                    recipientPeerId,
                    myWallet.privateKey
                );
            } else {
                encMessage = fileBuffer.toString("hex");
            }

            connection.send(
                JSON.stringify({
                    messageType: "file",
                    data: encMessage,
                    fileName: fileName,
                })
            );

            const fileURL = URL.createObjectURL(
                new Blob([fileBuffer], {
                    type: "application/octet-stream",
                })
            );
            setMessages([
                ...messages,
                {
                    sender: peerId,
                    content: fileName,
                    type: "file",
                    url: fileURL,
                    encrypted: confirmEncrypt,
                },
            ]);
        };
        reader.readAsArrayBuffer(selectedFile);
    }
};

export const handleReceiveMessage = (
    setMessages,
    privateKey,
    recipientPeerId,
    data
) => {
    const decryptedMessage = decryptText(data, recipientPeerId, privateKey);
    if (decryptedMessage !== "error") {
        setMessages((prevMessages) => [
            ...prevMessages,
            { sender: "Peer", content: decryptedMessage, type: "text" },
        ]);
    }
};

export const handleReceiveFile = (
    messages,
    setMessages,
    privateKey,
    recipientPeerId,
    data,
    openDecryptModal
) => {
    let fileURL;
    let fileName = data.fileName;
    let encrypted = false;

    if (!fileName) {
        console.error("Received file without a valid name.");
        return;
    }

    if (
        typeof data.data === "string" &&
        data.data.length % 2 === 0 &&
        /^[0-9a-f]+$/i.test(data.data)
    ) {
        const fileBuffer = Buffer.from(data.data, "hex");
        const blob = new Blob([fileBuffer], {
            type: "application/octet-stream",
        });
        fileURL = URL.createObjectURL(blob);
        toast.success("File received!");
    } else {
        const parsedData = JSON.parse(data.data);
        const { nonce, encrypted: encryptedData } = parsedData;

        if (!nonce || !encryptedData) {
            console.error("Invalid nonce or encrypted data:", nonce, encryptedData);
            return;
        }

        const fileBuffer = Buffer.from(encryptedData, "hex");
        fileURL = URL.createObjectURL(
            new Blob([fileBuffer], { type: "application/octet-stream" })
        );
        encrypted = true;
        toast.success("Encrypted file received!");

        openDecryptModal(() => {
            const decryptedFileURL = decryptFile(
                data.data,
                recipientPeerId,
                privateKey
            );
            if (decryptedFileURL) {
                fileURL = decryptedFileURL;
                fileName = fileName.replace("encrypted", "decrypted");
                toast.success("File decrypted!");
            } else {
                console.error("File decryption failed.");
                return;
            }
        });
    }

    const fileAlreadyExists = messages.some(
        (msg) => msg.content === fileName && msg.type === "file"
    );
    if (!fileAlreadyExists) {
        setMessages((prevMessages) => [
            ...prevMessages,
            {
                sender: "Peer",
                content: fileName,
                type: "file",
                url: fileURL,
                encrypted: encrypted,
            },
        ]);
    }
};