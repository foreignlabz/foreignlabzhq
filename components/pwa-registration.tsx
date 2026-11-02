'use client';
import {useEffect} from 'react';
export default function PWARegistration(){useEffect(()=>{if('serviceWorker' in navigator&&window.isSecureContext){void navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{/* Offline installation is optional; the workspace stays usable. */});}},[]);return null;}
