import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

const SessionContext = createContext<{
    session: Session | null;
    isLoading: boolean;
    isAnonymous: boolean;
}>({
    session: null,
    isLoading: true,
    isAnonymous: false,
});

export function useSession() {
    return useContext(SessionContext);
}

const SYNC_EVENTS: AuthChangeEvent[] = ['SIGNED_IN', 'USER_UPDATED', 'TOKEN_REFRESHED'];

export function SessionProvider({ children }: { children: ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setIsLoading(false);
            if (session) api.post('/api/users/sync', {}).catch(() => {});
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
            if (session && SYNC_EVENTS.includes(event)) {
                api.post('/api/users/sync', {}).catch(() => {});
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    return (
        <SessionContext.Provider value={{ session, isLoading, isAnonymous: session?.user.is_anonymous ?? false }}>
            {children}
        </SessionContext.Provider>
    );
}
