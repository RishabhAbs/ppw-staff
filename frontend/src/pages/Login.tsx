import React, { useState } from 'react';
import api from '../api';
import { Lock, User } from 'lucide-react';
import { getDefaultRoute } from '../utils';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Using direct axios call or the configured api instance
            const response = await api.post('/auth/login', { username, password });

            // Store token and user
            const { access_token, user } = response.data;

            if (user) {
                localStorage.setItem('user', JSON.stringify(user));
            }
            localStorage.setItem('token', access_token);

            // Redirect to the user's role-default page. If the account has no
            // accessible page (e.g. an employee with no permissions assigned),
            // getDefaultRoute returns '/login' — don't silently bounce back to
            // the login form (which looks like the login failed). Show a clear
            // message instead and clear the just-stored session.
            const route = getDefaultRoute(user);
            if (route === '/login') {
                localStorage.removeItem('user');
                localStorage.removeItem('token');
                setError('Login succeeded, but your account has no access permissions. Please contact an administrator.');
                return;
            }
            window.location.href = route;
        } catch (err: any) {
            console.error(err);
            setError('Invalid username or password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-indigo-300/10 rounded-full blur-[120px]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-pink-300/10 rounded-full blur-[100px]"></div>

            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md relative z-10 border border-slate-100">
                <div className="text-center mb-8">
                    <img src="/ppw-logo.png" alt="PPW Logo" className="w-24 h-24 mx-auto mb-4 object-contain" />
                    <h1 className="text-3xl font-bold text-slate-800 mb-2 tracking-tight">PPW</h1>
                    <p className="text-slate-500 font-medium">Purbanchal Papers & Works</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm font-medium mb-6">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-1">
                        <label className="text-sm font-bold text-slate-700 ml-1">Username</label>
                        <div className="relative">
                            <User className="absolute left-3 top-3.5 text-slate-400" size={20} />
                            <input
                                type="text"
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                placeholder="Enter username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-sm font-bold text-slate-700 ml-1">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3.5 text-slate-400" size={20} />
                            <input
                                type="password"
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                placeholder="Enter password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-70"
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>


                </form>
            </div>
            
            {/* Developer Credit */}
            <div className="absolute bottom-4 left-0 right-0 text-center z-10">
                <p className="text-[10px] text-slate-400 font-medium">
                    Designed and Developed by <a href="https://abstechnologies.co.in" target="_blank" rel="noopener noreferrer" className="text-slate-500 font-bold hover:text-indigo-600 transition-colors">ABS Technologies</a>
                </p>
            </div>
        </div>
    );
}
