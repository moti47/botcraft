import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '@/lib/supabaseClient'

export function Login() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / title */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gradient">Viral Empire</h1>
          <p className="text-sm text-muted-foreground">AI Influencer Control Panel</p>
        </div>

        {/* Auth card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-primary/5">
          <Auth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: 'hsl(var(--primary))',
                    brandAccent: 'hsl(var(--primary) / 0.8)',
                    inputBackground: 'hsl(var(--background))',
                    inputText: 'hsl(var(--foreground))',
                    inputBorder: 'hsl(var(--border))',
                    inputBorderFocus: 'hsl(var(--primary))',
                    // Message box — explicit values so the "Check your email"
                    // confirmation is always legible on a dark background
                    messageText: '#fafafa',
                    messageTextDanger: '#f87171',
                    messageBackground: '#111827',
                    messageBackgroundDanger: '#1f1215',
                    anchorTextColor: 'hsl(var(--primary))',
                    // Secondary / social buttons
                    defaultButtonBackground: '#1f1f1f',
                    defaultButtonBackgroundHover: '#2a2a2a',
                    defaultButtonBorder: '#333',
                    defaultButtonText: '#fafafa',
                    // Divider line between sections
                    dividerBackground: '#333',
                  },
                  borderWidths: { buttonBorderWidth: '1px', inputBorderWidth: '1px' },
                  radii: { borderRadiusButton: '8px', inputBorderRadius: '8px' },
                },
              },
              className: {
                container: 'space-y-3',
                label: 'text-sm font-medium text-foreground',
                button: 'w-full font-medium',
                input: 'bg-background text-foreground border-border',
              },
            }}
            providers={['google']}
            redirectTo={window.location.origin}
            socialLayout="horizontal"
            view="sign_in"
            showLinks
          />
        </div>

        <p className="text-center text-xs text-muted-foreground">
          By signing in you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
