import { h } from 'preact';
import { useContext } from 'preact/hooks';
import { PeerIdContext } from './peerIdContext';
import PeerIdDisplay from '../components/PeerIdDisplay';
import ConnectPeerForm from '../components/ConnectPeerForm';
import SecureChatInfo from '../components/SecureChatInfo';

const ShareSecurely = () => {
  const { peerId } = useContext(PeerIdContext);

  const handleInvite = () => {
    alert('Invite sent!');
  };

  const handleCopyPeerId = () => {
    navigator.clipboard.writeText(peerId).then(() => {
      alert('Peer ID copied to clipboard!');
    }).catch(err => {
      console.error('Could not copy text: ', err);
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-r from-blue-500 to-indigo-500 dark:from-gray-800 dark:to-gray-900">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-4xl transform transition duration-500 hover:scale-105 mb-8">
        <PeerIdDisplay handleInvite={handleInvite} handleCopyPeerId={handleCopyPeerId} />
        <ConnectPeerForm />
      </div>
      <SecureChatInfo />
    </div>
  );
};

export default ShareSecurely;
