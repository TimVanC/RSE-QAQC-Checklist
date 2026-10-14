import { redirect } from 'next/navigation';

/** The call queue is the home screen; the (app) layout has already checked the session. */
export default function HomePage() {
  redirect('/queue');
}
