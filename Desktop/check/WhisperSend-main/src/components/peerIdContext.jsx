import { createContext } from "preact";
import { useState, useEffect } from "preact/hooks";
import Peer from "peerjs";
import { handleReceiveMessage, handleReceiveFile } from "../utils/chatActions";
import { peerConfig } from "../utils/config";
import { ethers } from "ethers";
import ConfirmModal from "../components/ConfirmModal";

export const PeerIdContext = createContext();

export const PeerIdProvider = ({ children }) => {
    const [peer, setPeer] = useState(null);
    const [connection, setConnection] = useState(null);
    const [recipient, setRecipient] = useState("");
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState("");
    const [myWallet, setMyWallet] = useState(null);
    const [recipientPeerId, setRecipientPeerId] = useState("");
    const [peerId, setPeerId] = useState("");
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmCallback, setConfirmCallback] = useState(null);
    const [confirmModalData, setConfirmModalData] = useState({ title: "", message: "" });

    useEffect(() => {
        const newWallet = ethers.Wallet.createRandom();
        const { publicKey } = newWallet;
        setMyWallet(newWallet);
        setPeerId(publicKey);
        console.log("Wallet created with public key:", publicKey);
    }, []);

    useEffect(() => {
        if (!myWallet) return;

        const pr = new Peer(myWallet.publicKey, peerConfig);
        setPeer(pr);
        console.log("Peer created with ID:", myWallet.publicKey);

        return () => {
            pr.destroy();
            console.log("Peer destroyed");
        };
    }, [myWallet]);

    useEffect(() => {
        if (!peer) return;

        peer.on("connection", (con) => {
            console.log("Connection received from peer:", con.peer);
            con.on("open", () => {
                console.log("Connection opened with peer:", con.peer);
                setRecipient(con.peer);
                setRecipientPeerId(con.peer);
                setConnection(con);
            });
        });
    }, [peer]);

    useEffect(() => {
        if (!connection) return;

        connection.on("data", function (data) {
            handleData(data);
        });
        connection.on("close", () => {
            disconnect();
        });
        connection.on("error", (err) => {
            console.error("Connection error:", err);
        });
    }, [connection]);

    const connectRecipient = (e) => {
        e.preventDefault();
        if (connection) {
            disconnect();
        } else {
            connectToPeer(recipient);
            setRecipientPeerId(recipient);
        }
    };

    const connectToPeer = (recId) => {
        const con = peer.connect(recId);
        setConnection(con);
        setRecipientPeerId(recId);
    };

    const disconnect = () => {
        if (connection) {
            connection.close();
            setConnection(null);
        }
        setRecipient("");
        setRecipientPeerId("");
        setMessages([]);
        setMessage("");
    };

    const openConfirmModal = (title, message) => {
        return new Promise((resolve) => {
            setConfirmCallback(() => resolve);
            setConfirmModalData({ title, message });
            setShowConfirmModal(true);
        });
    };

    const closeConfirmModal = (confirmed) => {
        setShowConfirmModal(false);

        if (confirmCallback) {
            confirmCallback(confirmed);
        }
    };

    const handleData = (data) => {
        try {
            const parsedData = JSON.parse(data);

            if (parsedData.messageType === "file") {
                handleReceiveFile(
                    messages,
                    setMessages,
                    myWallet.privateKey,
                    recipientPeerId,
                    parsedData,
                    openConfirmModal
                );
            } else if (parsedData.messageType === "text") {
                handleReceiveMessage(
                    setMessages,
                    myWallet.privateKey,
                    recipientPeerId,
                    data
                );
            } else {
                console.log("Unknown messageType received");
            }
        } catch (error) {
            handleReceiveMessage(
                setMessages,
                myWallet.privateKey,
                recipientPeerId,
                data
            );
        }
    };

    return (
        <PeerIdContext.Provider
            value={{
                peer,
                connectToPeer,
                connectRecipient,
                disconnect,
                connection,
                recipient,
                setRecipient,
                messages,
                setMessages,
                message,
                setMessage,
                myWallet,
                peerId,
                recipientPeerId,
                setRecipientPeerId,
                openConfirmModal,
            }}
        >
            {children}
            {showConfirmModal && (
                <ConfirmModal
                    title={confirmModalData.title}
                    message={confirmModalData.message}
                    onConfirm={() => closeConfirmModal(true)}
                    onCancel={() => closeConfirmModal(false)}
                />
            )}
        </PeerIdContext.Provider>
    );
};