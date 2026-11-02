import React from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, BarChart3, Building2, Camera, Car, Check, CheckCircle2, ChevronLeft, ChevronRight,
  ClipboardList, Download, FileSpreadsheet, FileText, HardHat, Inbox, Lightbulb, MapPin, Menu, Moon, ParkingCircle,
  PartyPopper, Pause, Play, Plus, Printer, RefreshCw, Scale, Search, Sparkles, StickyNote, Sun, Trash2, TrendingUp, Undo2, User, Users, X,
} from 'lucide-react';

const MAP = {
  chart: BarChart3, car: Car, camera: Camera, hardhat: HardHat, trend: TrendingUp, alert: AlertTriangle, menu: Menu,
  refresh: RefreshCw, user: User, users: Users, check: Check, undo: Undo2, note: StickyNote, download: Download,
  plus: Plus, search: Search, x: X, scale: Scale, trash: Trash2, left: ChevronLeft, right: ChevronRight,
  party: PartyPopper, done: CheckCircle2, clipboard: ClipboardList, file: FileText, sheet: FileSpreadsheet,
  bulb: Lightbulb, back: ArrowLeft, next: ArrowRight, print: Printer, sparkles: Sparkles, pin: MapPin,
  play: Play, pause: Pause, parking: ParkingCircle, inbox: Inbox, sun: Sun, moon: Moon, building: Building2,
};

export const hasIcon = (name) => name in MAP;

// Consistent line icons (lucide). Size with className, e.g. "h-5 w-5".
export function Icon({ name, className = 'h-4 w-4', strokeWidth = 2 }) {
  const C = MAP[name];
  if (!C) return null;
  return <C className={'inline-block shrink-0 align-[-0.15em] ' + className} strokeWidth={strokeWidth} aria-hidden="true" />;
}
