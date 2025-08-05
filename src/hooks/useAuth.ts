import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { adminService } from '../services/adminService'
import type { User } from '@supabase/supabase-js'

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      
      // Load admin language preference if user exists
      if (session?.user) {
        loadAdminLanguagePreference(session.user.id)
      }
      
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth state changed:', event, session?.user?.id)
        setUser(session?.user ?? null)
        
        // Load admin language preference on sign in
        if (session?.user && event === 'SIGNED_IN') {
          loadAdminLanguagePreference(session.user.id)
        }
        
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const loadAdminLanguagePreference = async (userId: string) => {
    try {
      const adminProfile = await adminService.getAdminProfile(userId)
      if (adminProfile?.preferred_language) {
        // Update language context if available
        const savedLang = localStorage.getItem('restaurant-language')
        if (!savedLang || savedLang !== adminProfile.preferred_language) {
          localStorage.setItem('restaurant-language', adminProfile.preferred_language)
          // Trigger a custom event to update language context
          window.dispatchEvent(new CustomEvent('admin-language-loaded', { 
            detail: { language: adminProfile.preferred_language } 
          }))
        }
      }
    } catch (error) {
      console.error('Error loading admin language preference:', error)
    }
  }

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    return { data, error }
  }

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: undefined // Disable email confirmation
      }
    })
    
    // Create admin profile after successful signup
    if (data.user && !error) {
      const { error: profileError } = await supabase
        .from('admins')
        .insert([{
          id: data.user.id,
          email: data.user.email,
          name: email.split('@')[0], // Use email prefix as default name
          preferred_language: 'en'
        }])
      
      if (profileError) {
        console.error('Error creating admin profile:', profileError)
      }
    }
    
    return { data, error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    
    // If session doesn't exist, user is already logged out - treat as success
    if (error && error.message === 'Session from session_id claim in JWT does not exist') {
      return { error: null }
    }
    
    return { error }
  }

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut
  }
}