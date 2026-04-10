import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { io, Socket } from "socket.io-client";
import { 
  Upload, 
  FileSpreadsheet, 
  MessageSquare, 
  Image as ImageIcon, 
  Send, 
  CheckCircle2, 
  AlertCircle,
  Copy,
  Trash2,
  Info,
  QrCode,
  Smartphone,
  LogOut,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Contact {
  [key: string]: any;
}

export default function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [template, setTemplate] = useState("Hello {Name}, check out this image!");
  const [image, setImage] = useState<string | null>(null);
  const [phoneColumn, setPhoneColumn] = useState<string>("");
  const [nameColumn, setNameColumn] = useState<string>("");
  const [sentStatus, setSentStatus] = useState<Record<number, boolean>>({});
  const [isAutomated, setIsAutomated] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  
  // WhatsApp Web Sync State
  const [wsStatus, setWsStatus] = useState<"connecting" | "open" | "close" | "qr">("close");
  const [wsQr, setWsQr] = useState<string | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = io();

    socketRef.current.on("whatsapp:status", (status: any) => {
      setWsStatus(status);
      if (status === "open") {
        setIsSyncModalOpen(false);
        toast.success("WhatsApp Web Synced!");
      }
    });

    socketRef.current.on("whatsapp:qr", (qr: string) => {
      setWsQr(qr);
      setWsStatus("qr");
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const handleLogout = () => {
    socketRef.current?.emit("whatsapp:logout");
    toast.info("Logging out of WhatsApp Web...");
  };

  const handleReconnect = () => {
    socketRef.current?.emit("whatsapp:reconnect");
    toast.info("Attempting to reconnect...");
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true, cellNF: false, cellText: false });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Use raw: true and then manually format to avoid scientific notation issues
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as any[];

        if (jsonData.length > 0) {
          // Clean the data: trim keys and values, handle scientific notation
          const cleanedData = jsonData.filter(row => {
            // Filter out empty rows
            return Object.values(row).some(val => val !== null && val !== undefined && String(val).trim() !== "");
          }).map(row => {
            const newRow: any = {};
            Object.keys(row).forEach(key => {
              let value = row[key];
              
              // Handle scientific notation for numbers (common in Excel for phone numbers)
              if (typeof value === 'number' && !Number.isSafeInteger(value)) {
                // If it's a large number likely to be a phone number
                value = value.toLocaleString('fullwide', { useGrouping: false });
              } else if (value !== null && value !== undefined) {
                value = String(value).trim();
              }
              
              newRow[key.trim()] = value;
            });
            return newRow;
          });

          if (cleanedData.length === 0) {
            toast.error("The file appears to be empty or contains only empty rows.");
            return;
          }

          const cols = Object.keys(cleanedData[0]);
          setColumns(cols);
          setContacts(cleanedData);
          
          // Auto-detect columns
          const phoneCol = cols.find(c => {
            const low = c.toLowerCase();
            return low.includes('phone') || low.includes('mobile') || low.includes('contact') || low.includes('tel') || low.includes('number');
          });
          const nameCol = cols.find(c => {
            const low = c.toLowerCase();
            return low.includes('name') || low.includes('first') || low.includes('contact');
          });
          
          if (phoneCol) setPhoneColumn(phoneCol);
          if (nameCol && nameCol !== phoneCol) setNameColumn(nameCol);
          
          toast.success(`Imported ${cleanedData.length} contacts`);
        } else {
          toast.error("No data found in the selected file.");
        }
      } catch (error) {
        console.error("Error parsing Excel:", error);
        toast.error("Failed to parse Excel file. Please ensure it's a valid Excel or CSV file.");
      }
    };
    reader.readAsArrayBuffer(file);
    
    // Reset input so the same file can be uploaded again if needed
    if (e.target) e.target.value = "";
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImage(event.target?.result as string);
      toast.success("Image uploaded successfully");
    };
    reader.readAsDataURL(file);
  };

  const personalizeMessage = (contact: Contact) => {
    let msg = template;
    columns.forEach(col => {
      const value = contact[col] || "";
      msg = msg.replace(new RegExp(`{${col}}`, 'g'), value);
    });
    return msg;
  };

  const copyImageToClipboard = async () => {
    if (!image) return;
    try {
      const response = await fetch(image);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      toast.success("Image copied to clipboard! You can now paste it in WhatsApp.");
    } catch (err) {
      console.error("Failed to copy image:", err);
      toast.error("Failed to copy image to clipboard");
    }
  };

  const sendWhatsApp = (contact: Contact, index: number) => {
    if (!phoneColumn) {
      toast.error("Please select the Phone Column first");
      return;
    }
    const phone = contact[phoneColumn];
    if (!phone) {
      toast.error("No phone number found for this contact");
      return;
    }

    const message = personalizeMessage(contact);
    const cleanPhone = String(phone).replace(/\D/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    
    window.open(url, '_blank');
    setSentStatus(prev => ({ ...prev, [index]: true }));
  };

  const sendAutomated = async (contact: Contact, index: number) => {
    if (!phoneColumn) {
      toast.error("Please select the Phone Column first");
      return false;
    }
    const phone = contact[phoneColumn];
    if (!phone) return false;

    const message = personalizeMessage(contact);
    const cleanPhone = String(phone).replace(/\D/g, '');

    const endpoint = wsStatus === "open" ? "/api/whatsapp/web/send" : "/api/whatsapp/send";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: cleanPhone,
          message: message,
          imageUrl: image 
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send");

      setSentStatus(prev => ({ ...prev, [index]: true }));
      return true;
    } catch (error: any) {
      console.error("Automated send error:", error);
      toast.error(`Failed to send to ${contact[nameColumn] || phone}: ${error.message}`);
      return false;
    }
  };

  const syncAll = async () => {
    if (!isAutomated) {
      toast.error("Please enable 'Automated Mode' to sync all messages.");
      return;
    }

    if (!phoneColumn) {
      toast.error("Please select the Phone Column first");
      return;
    }

    const unsentContacts = contacts.filter((_, idx) => !sentStatus[idx]);
    if (unsentContacts.length === 0) {
      toast.info("All contacts have already been messaged.");
      return;
    }

    setIsSending(true);
    let successCount = 0;

    for (let i = 0; i < contacts.length; i++) {
      if (!sentStatus[i]) {
        const success = await sendAutomated(contacts[i], i);
        if (success) successCount++;
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setIsSending(false);
    toast.success(`Sync complete! Sent ${successCount} messages.`);
  };

  const sendSelected = async () => {
    if (selectedIndices.size === 0) {
      toast.error("Please select at least one contact.");
      return;
    }

    if (!phoneColumn) {
      toast.error("Please select the Phone Column first");
      return;
    }

    const indices = Array.from(selectedIndices) as number[];
    
    if (!isAutomated) {
      // Manual Mode: Open multiple tabs
      if (indices.length > 5) {
        const confirm = window.confirm(`You are about to open ${indices.length} WhatsApp tabs. Your browser might block these popups. Continue?`);
        if (!confirm) return;
      }
      
      indices.forEach((idx) => {
        sendWhatsApp(contacts[idx], idx);
      });
      toast.success(`Opening ${indices.length} WhatsApp tabs...`);
    } else {
      // Automated Mode
      setIsSending(true);
      let successCount = 0;

      for (const idx of indices) {
        const success = await sendAutomated(contacts[idx], idx);
        if (success) successCount++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setIsSending(false);
      toast.success(`Bulk send complete! Sent ${successCount} messages.`);
      setSelectedIndices(new Set());
    }
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === contacts.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(contacts.map((_, i) => i)));
    }
  };

  const toggleSelect = (index: number) => {
    const newSelected = new Set(selectedIndices);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedIndices(newSelected);
  };

  const clearAll = () => {
    setContacts([]);
    setColumns([]);
    setImage(null);
    setSentStatus({});
    setSelectedIndices(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (imageInputRef.current) imageInputRef.current.value = "";
    toast.info("All data cleared");
  };

  const sentCount = Object.keys(sentStatus).length;
  const totalCount = contacts.length;
  const progressPercentage = totalCount > 0 ? (sentCount / totalCount) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">WhatsApp Broadcaster</h1>
            <p className="text-slate-500 mt-1">Personalized messaging made simple.</p>
          </div>
          <div className="flex items-center gap-2">
            <Dialog>
              <DialogTrigger render={<Button variant="outline" size="sm" />}>
                <Info className="w-4 h-4 mr-2" />
                How it works
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>How to use this tool</DialogTitle>
                  <DialogDescription render={<div className="space-y-4 pt-4" />}>
                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                      <p>Upload an Excel file (.xlsx or .xls) containing your contacts.</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                      <p>Map the <strong>Phone</strong> and <strong>Name</strong> columns from your file.</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold shrink-0">3</div>
                      <p>Write your message template. Use <code>{"{ColumnName}"}</code> for personalization.</p>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold shrink-0">4</div>
                      <p>Upload an image and use the <strong>Copy Image</strong> button before sending.</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-md text-amber-800 text-sm">
                      <strong>Note:</strong> Browsers cannot automatically attach images to WhatsApp. You must copy the image here and paste (Ctrl+V) it in the WhatsApp window that opens.
                    </div>
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
            <Button variant="destructive" size="sm" onClick={clearAll} disabled={contacts.length === 0 && !image}>
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All
            </Button>
            <Button 
              variant={isAutomated ? "default" : "outline"} 
              size="sm" 
              onClick={() => setIsAutomated(!isAutomated)}
              className={isAutomated ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              <Send className="w-4 h-4 mr-2" />
              {isAutomated ? "Automated Mode" : "Manual Mode"}
            </Button>

            <Dialog open={isSyncModalOpen} onOpenChange={setIsSyncModalOpen}>
              <DialogTrigger render={
                <Button 
                  variant={wsStatus === "open" ? "default" : "outline"} 
                  size="sm"
                  className={wsStatus === "open" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                />
              }>
                {wsStatus === "open" ? (
                  <><Smartphone className="w-4 h-4 mr-2" /> Synced</>
                ) : (
                  <><QrCode className="w-4 h-4 mr-2" /> Sync WhatsApp Web</>
                )}
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Sync WhatsApp Web</DialogTitle>
                  <DialogDescription render={<div className="pt-4 space-y-4" />}>
                    {wsStatus === "open" ? (
                      <div className="text-center space-y-4">
                        <div className="flex justify-center">
                          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                          </div>
                        </div>
                        <p className="font-medium text-slate-900">Successfully connected to WhatsApp!</p>
                        <p className="text-sm text-slate-500">You can now send messages directly from your account.</p>
                        <Button variant="destructive" onClick={handleLogout} className="w-full">
                          <LogOut className="w-4 h-4 mr-2" />
                          Logout Session
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                          <ol className="text-sm space-y-2 list-decimal list-inside text-slate-600">
                            <li>Open WhatsApp on your phone</li>
                            <li>Tap <strong>Menu</strong> or <strong>Settings</strong> and select <strong>Linked Devices</strong></li>
                            <li>Tap on <strong>Link a Device</strong></li>
                            <li>Point your phone to this screen to capture the code</li>
                          </ol>
                        </div>
                        
                        <div className="flex flex-col items-center justify-center min-h-[250px] bg-white border border-slate-100 rounded-xl shadow-inner p-4">
                          {wsStatus === "qr" && wsQr ? (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="relative"
                            >
                              <img src={wsQr} alt="WhatsApp QR Code" className="w-64 h-64" />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-white/10 backdrop-blur-[1px]">
                                <Button size="sm" variant="secondary" onClick={handleReconnect}>
                                  <RefreshCw className="w-4 h-4 mr-2" />
                                  Refresh Code
                                </Button>
                              </div>
                            </motion.div>
                          ) : (
                            <div className="flex flex-col items-center gap-4">
                              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                              <p className="text-sm text-slate-500">Generating QR Code...</p>
                              <Button variant="ghost" size="sm" onClick={handleReconnect}>
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Retry
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Configuration */}
          <div className="lg:col-span-1 space-y-6">
            {/* Step 1: Import */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  1. Import Contacts
                </CardTitle>
                <CardDescription>Upload your Excel contact list</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div 
                  className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-emerald-400 transition-colors cursor-pointer group"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-8 h-8 mx-auto text-slate-400 group-hover:text-emerald-500 transition-colors mb-2" />
                  <p className="text-sm font-medium text-slate-600">Click to upload Excel</p>
                  <p className="text-xs text-slate-400 mt-1">.xlsx, .xls, .csv</p>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".xlsx, .xls, .csv" 
                    onChange={handleFileUpload} 
                  />
                </div>

                {columns.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="phone-col">Phone Column</Label>
                      <select 
                        id="phone-col"
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        value={phoneColumn}
                        onChange={(e) => setPhoneColumn(e.target.value)}
                      >
                        <option value="">Select column...</option>
                        {columns.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="name-col">Name Column (Optional)</Label>
                      <select 
                        id="name-col"
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        value={nameColumn}
                        onChange={(e) => setNameColumn(e.target.value)}
                      >
                        <option value="">Select column...</option>
                        {columns.map(col => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 2: Message Template */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                  2. Message Template
                </CardTitle>
                <CardDescription>Customize your message</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea 
                  placeholder="Type your message here..."
                  className="min-h-[120px] resize-none"
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                />
                <div className="flex flex-wrap gap-1.5">
                  {columns.map(col => (
                    <button
                      key={col}
                      onClick={() => setTemplate(prev => prev + `{${col}}`)}
                      className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded transition-colors"
                    >
                      +{col}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Step 3: Image */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-purple-600" />
                  3. Attachment
                </CardTitle>
                <CardDescription>Add an image to share</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!image ? (
                  <div 
                    className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-purple-400 transition-colors cursor-pointer group"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <Upload className="w-8 h-8 mx-auto text-slate-400 group-hover:text-purple-500 transition-colors mb-2" />
                    <p className="text-sm font-medium text-slate-600">Upload Image</p>
                    <input 
                      type="file" 
                      ref={imageInputRef} 
                      className="hidden" 
                      accept="image/*" 
                      onChange={handleImageUpload} 
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-50 group">
                      <img src={image} alt="Preview" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                      <Button 
                        variant="destructive" 
                        size="icon" 
                        className="absolute top-2 right-2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setImage(null)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button 
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                      onClick={copyImageToClipboard}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Image to Clipboard
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Contact List */}
          <div className="lg:col-span-2 space-y-6">
            {contacts.length > 0 && (
              <Card className="border-slate-200 shadow-sm overflow-hidden">
                <CardContent className="p-6">
                  <Progress value={progressPercentage} className="w-full">
                    <div className="flex items-center justify-between mb-2">
                      <ProgressLabel className="text-sm font-semibold text-slate-700">Broadcast Progress</ProgressLabel>
                      <div className="flex items-center gap-3">
                        {selectedIndices.size > 0 && (
                          <Button 
                            size="xs" 
                            onClick={sendSelected} 
                            disabled={isSending}
                            className="h-7 bg-indigo-600 hover:bg-indigo-700"
                          >
                            <Send className="w-3 h-3 mr-1.5" />
                            Send Selected ({selectedIndices.size})
                          </Button>
                        )}
                        {isAutomated && contacts.length > 0 && (
                          <Button 
                            size="xs" 
                            onClick={syncAll} 
                            disabled={isSending || sentCount === totalCount}
                            className="h-7 bg-blue-600 hover:bg-blue-700"
                          >
                            {isSending ? "Syncing..." : "Sync All (Automated)"}
                          </Button>
                        )}
                        <span className="text-sm font-medium text-slate-500 tabular-nums">
                          {sentCount} of {totalCount} messages sent ({Math.round(progressPercentage)}%)
                        </span>
                      </div>
                    </div>
                  </Progress>
                </CardContent>
              </Card>
            )}

            <Card className="border-slate-200 shadow-sm min-h-[600px] flex flex-col">
              <CardHeader className="border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">Contact List</CardTitle>
                    <CardDescription>
                      {contacts.length > 0 ? `${contacts.length} contacts loaded` : "No contacts imported yet"}
                    </CardDescription>
                  </div>
                  {contacts.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      {Object.keys(sentStatus).length} Sent
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-grow overflow-auto">
                {contacts.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50">
                        <TableHead className="w-[40px]">
                          <Checkbox 
                            checked={contacts.length > 0 && selectedIndices.size === contacts.length}
                            onCheckedChange={() => toggleSelectAll()}
                            aria-label="Select all"
                          />
                        </TableHead>
                        <TableHead className="w-[50px]">#</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Message Preview</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.map((contact, idx) => (
                        <TableRow 
                          key={idx} 
                          className={`group hover:bg-slate-50/80 transition-colors ${selectedIndices.has(idx) ? 'bg-blue-50/50' : ''}`}
                        >
                          <TableCell>
                            <Checkbox 
                              checked={selectedIndices.has(idx)}
                              onCheckedChange={() => toggleSelect(idx)}
                              aria-label={`Select contact ${idx + 1}`}
                            />
                          </TableCell>
                          <TableCell className="text-slate-400 font-mono text-xs">{idx + 1}</TableCell>
                          <TableCell className="font-medium">
                            {nameColumn ? contact[nameColumn] : "N/A"}
                          </TableCell>
                          <TableCell className="text-slate-600">
                            {phoneColumn ? contact[phoneColumn] : <span className="text-red-400 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Missing</span>}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-slate-500 text-xs italic">
                            {personalizeMessage(contact)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              size="sm" 
                              variant={sentStatus[idx] ? "outline" : "default"}
                              className={sentStatus[idx] ? "border-emerald-200 text-emerald-600" : (isAutomated ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700")}
                              onClick={() => isAutomated ? sendAutomated(contacts[idx], idx) : sendWhatsApp(contact, idx)}
                              disabled={isSending}
                            >
                              {sentStatus[idx] ? (
                                <><CheckCircle2 className="w-4 h-4 mr-2" /> Resend</>
                              ) : (
                                <>{isAutomated ? <Send className="w-4 h-4 mr-2" /> : <Send className="w-4 h-4 mr-2" />} Send</>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[400px] text-slate-400 space-y-4">
                    <FileSpreadsheet className="w-16 h-16 opacity-20" />
                    <div className="text-center">
                      <p className="font-medium">No contacts to display</p>
                      <p className="text-sm">Import an Excel file to get started</p>
                    </div>
                  </div>
                )}
              </CardContent>
              {contacts.length > 0 && (
                <CardFooter className="border-t border-slate-100 bg-slate-50/30 py-4">
                  <p className="text-xs text-slate-400 flex items-center gap-2">
                    <Info className="w-3 h-3" />
                    Click "Send" to open WhatsApp Web/Desktop with the personalized message.
                  </p>
                </CardFooter>
              )}
            </Card>
          </div>
        </div>
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}
