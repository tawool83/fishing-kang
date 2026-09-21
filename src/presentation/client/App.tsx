import { route } from './router';
import { Home } from './pages/Home';
import { CreatedRoom } from './pages/CreatedRoom';
import { JoinRoom } from './pages/JoinRoom';
import { CatchBoard } from './pages/CatchBoard';

export function App() {
  const current = route.value;

  switch (current.name) {
    case 'home':
      return <Home />;
    case 'created':
      return <CreatedRoom code={current.code} />;
    case 'join':
      return <JoinRoom code={current.code} />;
    case 'room':
      return <CatchBoard code={current.code} />;
  }
}
