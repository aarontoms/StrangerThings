import { Toaster } from 'react-hot-toast';
import { Home } from './pages/Home';

function App() {
  return (
    <>
      <Toaster position="top-center" />
      <Home />
    </>
  );
}

export default App;
