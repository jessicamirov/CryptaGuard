import { createContext, h } from "preact"
import { useState, useEffect } from "preact/hooks"
import Peer from "peerjs"
import { ethers } from "ethers"
import nacl from "tweetnacl"
import { Buffer } from "buffer"
import elliptic from "elliptic"
import { toast } from "react-toastify"
import { peerConfig } from "../utils/config"
const ec = elliptic.ec

export const PeerIdContext = createContext()

export const PeerIdProvider = ({ children }) => {
    const [peer, setPeer] = useState(null)
    const [connection, setConnection] = useState(null)
    const [recipient, setRecipient] = useState("")
    const [messages, setMessages] = useState([])
    const [message, setMessage] = useState("")
    const [myWallet, setMyWallet] = useState(null)
    const [recipientPeerId, setRecipientPeerId] = useState("")
    const [peerId, setPeerId] = useState("")

    const getSharedSecret = (publicKeyHex, privateKeyHex) => {
        const secp256k1 = new ec("secp256k1")
        const senderEcKey = secp256k1.keyFromPrivate(
            privateKeyHex.slice(2),
            "hex",
        )
        const recipientEcKey = secp256k1.keyFromPublic(
            publicKeyHex.slice(2),
            "hex",
        )
        const sharedSecret = senderEcKey.derive(recipientEcKey.getPublic())
        return Buffer.from(sharedSecret.toArray("be", 32))
    }

    const encryptText = (text, recipientPublicKey, senderPrivateKey) => {
        const sharedSecret = getSharedSecret(
            recipientPublicKey,
            senderPrivateKey,
        )
        const nonce = nacl.randomBytes(24)
        const encrypted = nacl.box.after(Buffer.from(text), nonce, sharedSecret)

        const encryptedObj = {
            nonce: Buffer.from(nonce).toString("hex"),
            encrypted: Buffer.from(encrypted).toString("hex"),
        }
        console.log("Encrypted text:", encryptedObj) // Log the encrypted text
        return encryptedObj
    }

    const decryptText = (
        encryptedMessage,
        senderPublicKey,
        recipientPrivateKey,
    ) => {
        if (!encryptedMessage || typeof encryptedMessage !== "string") {
            console.error("Invalid encrypted message:", encryptedMessage)
            return "error"
        }

        if (!encryptedMessage.startsWith("{")) {
            return Buffer.from(encryptedMessage, "hex").toString()
        }

        const encryptedObj = JSON.parse(encryptedMessage)
        try {
            const sharedSecret = getSharedSecret(
                senderPublicKey,
                recipientPrivateKey,
            )
            const { nonce, encrypted } = encryptedObj

            if (!nonce || !encrypted) {
                console.error(
                    "Invalid nonce or encrypted data:",
                    nonce,
                    encrypted,
                )
                return "error"
            }

            console.log("nonce:", nonce) // Log the nonce
            console.log("encrypted:", encrypted) // Log the encrypted data

            const decrypted = nacl.box.open.after(
                Uint8Array.from(Buffer.from(encrypted, "hex")),
                Uint8Array.from(Buffer.from(nonce, "hex")),
                sharedSecret,
            )

            if (decrypted) {
                const decryptedMessage = Buffer.from(decrypted).toString()
                console.log("Decrypted message:", decryptedMessage) // Log the decrypted message
                return decryptedMessage
            } else {
                console.error(
                    "Decryption failed. Check keys, nonce, and encrypted values.",
                )
                return "error"
            }
        } catch (error) {
            console.error("Decryption process error:", error)
            return "error"
        }
    }

    const encryptFile = (fileBuffer, recipientPublicKey, senderPrivateKey) => {
        const sharedSecret = getSharedSecret(
            recipientPublicKey,
            senderPrivateKey,
        )

        if (!(fileBuffer instanceof Buffer)) {
            throw new Error("Input must be a Buffer")
        }

        const nonce = nacl.randomBytes(24)
        const encrypted = nacl.box.after(fileBuffer, nonce, sharedSecret)

        const encryptedObj = {
            nonce: Buffer.from(nonce).toString("hex"),
            encrypted: Buffer.from(encrypted).toString("hex"),
        }

        return JSON.stringify(encryptedObj)
    }

    const decryptFile = (
        encryptedMessage,
        senderPublicKey,
        recipientPrivateKey,
    ) => {
        if (!encryptedMessage.startsWith("{")) {
            const fileBuffer = Buffer.from(encryptedMessage, "hex")
            const blob = new Blob([fileBuffer], {
                type: "application/octet-stream",
            })
            return URL.createObjectURL(blob)
        }

        try {
            const encryptedObj = JSON.parse(encryptedMessage)
            const { nonce, encrypted } = encryptedObj
            const sharedSecret = getSharedSecret(
                senderPublicKey,
                recipientPrivateKey,
            )

            console.log("nonce:", nonce) // Log the nonce
            console.log("encrypted:", encrypted) // Log the encrypted data

            const decrypted = nacl.box.open.after(
                Uint8Array.from(Buffer.from(encrypted, "hex")),
                Uint8Array.from(Buffer.from(nonce, "hex")),
                sharedSecret,
            )

            if (decrypted) {
                const decryptedBuffer = Buffer.from(decrypted)
                const blob = new Blob([decryptedBuffer], {
                    type: "application/octet-stream",
                })
                const url = URL.createObjectURL(blob)
                return url
            } else {
                console.error(
                    "Decryption failed. Check keys, nonce, and encrypted values.",
                )
                return null
            }
        } catch (error) {
            console.error("Decryption process error:", error)
            return null
        }
    }

    const handleReceiveFile = (data) => {
        console.log("handleReceiveFile called with:", data)
        let fileURL
        let fileName = data.fileName // משתמשים בשם הקובץ שנשלח עם המידע
        let encrypted = false

        if (!fileName) {
            console.error("Received file without a valid name.")
            return // אין מה לעשות אם אין שם קובץ, לא מוסיפים אותו לרשימה
        }

        console.log("Processing file:", fileName)

        if (
            typeof data.data === "string" &&
            data.data.length % 2 === 0 &&
            /^[0-9a-f]+$/i.test(data.data)
        ) {
            // הקובץ לא מוצפן, שולח כ-Hex
            console.log("Processing unencrypted file:", fileName)
            const fileBuffer = Buffer.from(data.data, "hex")
            const blob = new Blob([fileBuffer], {
                type: "application/octet-stream",
            })
            fileURL = URL.createObjectURL(blob)
            toast.success("File received!")
        } else {
            // הקובץ מוצפן
            console.log("Processing encrypted file:", fileName)
            const parsedData = JSON.parse(data.data)
            const { nonce, encrypted: encryptedData } = parsedData

            if (!nonce || !encryptedData) {
                console.error(
                    "Invalid nonce or encrypted data:",
                    nonce,
                    encryptedData,
                )
                return
            }

            const fileBuffer = Buffer.from(encryptedData, "hex")
            fileURL = URL.createObjectURL(
                new Blob([fileBuffer], { type: "application/octet-stream" }),
            )
            encrypted = true
            toast.success("Encrypted file received!")

            const confirmDecrypt = window.confirm(
                "Do you want to decrypt the file?",
            )
            if (confirmDecrypt) {
                console.log("User chose to decrypt the file:", fileName)
                const decryptedFileURL = decryptFile(
                    data.data,
                    recipientPeerId,
                    myWallet.privateKey,
                )
                if (decryptedFileURL) {
                    fileURL = decryptedFileURL
                    fileName = fileName.replace("encrypted", "decrypted") // שינוי שם הקובץ המפוענח
                    toast.success("File decrypted!")
                } else {
                    console.error("File decryption failed.")
                    return // לא מוסיף את הקובץ אם הפענוח נכשל
                }
            } else {
                console.log("User chose not to decrypt the file:", fileName)
            }
        }

        const fileAlreadyExists = messages.some(
            (msg) => msg.content === fileName && msg.type === "file",
        )
        if (fileAlreadyExists) {
            console.log(
                "File already exists in messages, not adding again:",
                fileName,
            )
        } else {
            console.log("Adding file to messages:", fileName)
            setMessages((prevMessages) => [
                ...prevMessages,
                {
                    sender: "Peer",
                    content: fileName,
                    type: "file",
                    url: fileURL,
                    encrypted: encrypted,
                },
            ])
        }
    }

    useEffect(() => {
        const newWallet = ethers.Wallet.createRandom()
        const { publicKey, privateKey } = newWallet
        setMyWallet(newWallet)
        setPeerId(publicKey) // Set the peer ID
    }, [])

    useEffect(() => {
        if (!myWallet) return

        const pr = new Peer(myWallet.publicKey, peerConfig)
        setPeer(pr)
        // pr.on("open", (id) => {
        //     console.log("My peer ID is: " + id)
        //     setPeerId(id)
        // })
        return () => {
            pr.destroy()
        }
    }, [myWallet])

    useEffect(() => {
        if (!peer) return
        // listen for incoming connections
        peer.on("connection", (con) => {
            console.log("Connection received")
            con.on("open", () => {
                console.log("Connected")
                setRecipient(con.peer)
                setRecipientPeerId(con.peer)
                setConnection(con)
            })
        })
    }, [peer])

    useEffect(() => {
        if (!connection) return
        connection.on("data", function (data) {
            handleData(data)
        })
        connection.on("close", () => {
            disconnect()
        })
        connection.on("error", (err) => {
            console.error("Connection error:", err)
        })
    }, [connection])

    const connectRecipient = (e) => {
        e.preventDefault()
        if (connection) {
            disconnect()
        } else {
            connect(recipient)
            setRecipientPeerId(recipient)
        }
    }

    const connectToPeer = (recId) => {
        const con = peer.connect(recId)
        setConnection(con)
        setRecipientPeerId(recId)
        console.log("Connection established - sender")
    }

    const disconnect = () => {
        if (connection) {
            connection.close()
            setConnection(null)
        }
        setRecipient("")
        setRecipientPeerId("")
        setMessages([])
        setMessage("")
    }

    const handleData = (data) => {
        console.log("handleData called with:", data)

        try {
            const parsedData = JSON.parse(data)

            if (parsedData.messageType === "file") {
                console.log("File received in handleData:", parsedData.fileName)
                handleReceiveFile(parsedData)
            } else if (parsedData.messageType === "text") {
                console.log("Text received in handleData")
                handleReceiveMessage(data)
            } else {
                console.log("Unknown messageType received in handleData")
            }
        } catch (error) {
            console.log("Text received that is not JSON in handleData")
            handleReceiveMessage(data)
        }
    }

    const handleReceiveMessage = (data) => {
        console.log("Received message:", data)
        const decryptedMessage = decryptText(
            data,
            recipientPeerId,
            myWallet.privateKey,
        )
        console.log("Decrypted message:", decryptedMessage)
        if (decryptedMessage !== "error") {
            setMessages((prevMessages) => [
                ...prevMessages,
                { sender: "Peer", content: decryptedMessage, type: "text" },
            ])
        }
    }

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
                encryptText,
                decryptText,
                encryptFile,
                decryptFile,
                peerId,
                recipientPeerId,
                setRecipientPeerId,
            }}
        >
            {children}
        </PeerIdContext.Provider>
    )
}
