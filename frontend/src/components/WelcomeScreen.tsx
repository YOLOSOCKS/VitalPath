import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface WelcomeScreenProps {
    onComplete: () => void;
}

const MISSION_LINES = [
    'Every Minute Counts.',
    'Every Organ Matters.',
    'Every Life Saved.',
];

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onComplete }) => {
    const [exiting, setExiting] = useState(false);

    const handleBeginClick = () => {
        if (exiting) return;
        setExiting(true);
        setTimeout(() => onComplete(), 600);
    };

    return (
        <motion.div
            className="welcome-screen welcome-screen-red"
            initial={{ opacity: 1 }}
            animate={exiting ? { opacity: 0, scale: 1.1 } : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'radial-gradient(ellipse at center, #1a0a0a 0%, #0a0505 50%, #000000 100%)',
                overflow: 'hidden',
                cursor: 'default',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0.05,
                    backgroundImage: 'linear-gradient(#ef4444 1px, transparent 1px), linear-gradient(90deg, #ef4444 1px, transparent 1px)',
                    backgroundSize: '50px 50px',
                    pointerEvents: 'none',
                }}
            />

            <div className="welcome-scanline welcome-scanline-red" />

            <motion.div
                initial={{ opacity: 0, scale: 0.3, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}
            >
                <h1
                    style={{
                        fontSize: 'clamp(3rem, 8vw, 6rem)',
                        fontWeight: 900,
                        letterSpacing: '-0.03em',
                        color: '#fff',
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                        margin: 0,
                        lineHeight: 1,
                        textShadow: '0 0 40px rgba(239, 68, 68, 0.3), 0 0 80px rgba(239, 68, 68, 0.15)',
                    }}
                >
                    <span style={{ color: '#ef4444', textShadow: '0 0 40px rgba(239, 68, 68, 0.6), 0 0 80px rgba(239, 68, 68, 0.25)' }}>Vital</span><span style={{ color: '#fff' }}>Path AI</span>
                </h1>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8, duration: 0.6 }}
                    style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        fontSize: '0.85rem',
                        letterSpacing: '0.3em',
                        color: '#f87171',
                        textTransform: 'uppercase',
                        marginTop: '0.75rem',
                        opacity: 0.85,
                    }}
                >
                    Automated Organ Transport Dashboard
                </motion.div>
            </motion.div>

            <div style={{ marginTop: '3rem', textAlign: 'center', position: 'relative', zIndex: 2 }}>
                {MISSION_LINES.map((text, i) => (
                    <motion.div
                        key={text}
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1.4 + i * 0.3, duration: 0.6, ease: 'easeOut' }}
                        style={{
                            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                            fontSize: 'clamp(0.85rem, 2vw, 1.1rem)',
                            letterSpacing: '0.2em',
                            color: i === 2 ? '#f87171' : 'rgba(255,255,255,0.6)',
                            fontWeight: i === 2 ? 700 : 400,
                            marginBottom: '0.6rem',
                            textShadow: i === 2 ? '0 0 20px rgba(239, 68, 68, 0.5)' : 'none',
                        }}
                    >
                        ▸ {text}
                    </motion.div>
                ))}
            </div>

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 2.6, duration: 0.8 }}
                style={{ marginTop: '4rem', position: 'relative', zIndex: 2 }}
            >
                <motion.button
                    type="button"
                    onClick={handleBeginClick}
                    disabled={exiting}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                        fontSize: '1rem',
                        letterSpacing: '0.35em',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: '#f87171',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '2px solid rgba(239, 68, 68, 0.5)',
                        borderRadius: 8,
                        padding: '1rem 2.5rem',
                        cursor: exiting ? 'default' : 'pointer',
                        boxShadow: '0 0 30px rgba(239, 68, 68, 0.2)',
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={(e) => {
                        if (!exiting) {
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.9)';
                            e.currentTarget.style.boxShadow = '0 0 40px rgba(239, 68, 68, 0.35)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                        e.currentTarget.style.boxShadow = '0 0 30px rgba(239, 68, 68, 0.2)';
                    }}
                >
                    {exiting ? '…' : 'Begin'}
                </motion.button>
            </motion.div>

            <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 2.2, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                style={{
                    position: 'absolute',
                    bottom: '2rem',
                    width: '60%',
                    height: 1,
                    background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.4), transparent)',
                    transformOrigin: 'center',
                    zIndex: 2,
                }}
            />

            <AnimatePresence>
                {exiting && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 0.3, 0] }}
                        transition={{ duration: 0.6 }}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'radial-gradient(circle, rgba(239,68,68,0.35) 0%, transparent 70%)',
                            zIndex: 10,
                            pointerEvents: 'none',
                        }}
                    />
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default WelcomeScreen;
