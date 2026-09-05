import React, { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  FileText,
  FileSpreadsheet,
  FileCode,
  FileCheck,
  Search,
  Plus,
  Trash2,
  ExternalLink,
  RefreshCw,
  Bookmark,
  BookmarkCheck,
  HardDrive,
  UserCheck,
  ChevronRight,
  Eye,
  X,
  AlertTriangle,
  Layers,
  Database,
  CheckCircle2,
  FolderPlus,
  Upload,
} from 'lucide-react';
import {
  initAuth,
  googleSignIn,
  googleLogout,
  getAccessToken,
  GOOGLE_DRIVE_SCOPES,
  testFirestoreConnection,
} from '../lib/firebase';
import {
  listDriveFiles,
  getDriveAbout,
  getDriveFileContent,
  createDriveFile,
  deleteDriveFile,
  saveDriveBookmarkToFirestore,
  fetchUserBookmarksFromFirestore,
  removeDriveBookmarkFromFirestore,
  DriveFileItem,
  DriveAboutInfo,
  DriveBookmark,
} from '../lib/googleDriveService';

export const GoogleDriveView: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Drive state
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [aboutInfo, setAboutInfo] = useState<DriveAboutInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mimeFilter, setMimeFilter] = useState<'all' | 'folder' | 'document' | 'spreadsheet' | 'presentation' | 'bookmarks'>('all');
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [folderBreadcrumbs, setFolderBreadcrumbs] = useState<{ id: string; name: string }[]>([
    { id: 'root', name: 'My Drive' },
  ]);

  // Firestore bookmarks
  const [bookmarks, setBookmarks] = useState<Record<string, DriveBookmark>>({});
  const [firestoreOnline, setFirestoreOnline] = useState<boolean | null>(null);

  // Modals
  const [previewFile, setPreviewFile] = useState<{ item: DriveFileItem; content?: string; isLoading: boolean } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ file: DriveFileItem; isOpen: boolean; isDeleting: boolean } | null>(null);
  const [createModal, setCreateModal] = useState<{
    isOpen: boolean;
    type: 'doc' | 'text' | 'folder';
    name: string;
    content: string;
    isCreating: boolean;
  }>({
    isOpen: false,
    type: 'doc',
    name: '',
    content: '',
    isCreating: false,
  });

  // Check Firestore connection
  useEffect(() => {
    testFirestoreConnection().then((ok) => setFirestoreOnline(ok));
  }, []);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        if (token) {
          setAccessToken(token);
        }
      },
      () => {
        setCurrentUser(null);
        setAccessToken(null);
      }
    );

    // Initial check of in-memory token
    getAccessToken().then((t) => {
      if (t) setAccessToken(t);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Load files when access token or folder or filter changes
  const loadFiles = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingFiles(true);
    setAuthError(null);

    try {
      if (mimeFilter === 'bookmarks' && currentUser?.uid) {
        // Load from Firestore
        const bMarks = await fetchUserBookmarksFromFirestore(currentUser.uid);
        const bMap: Record<string, DriveBookmark> = {};
        bMarks.forEach((b) => {
          bMap[b.fileId] = b;
        });
        setBookmarks(bMap);

        // Map bookmarks to file items for uniform display
        const mappedFiles: DriveFileItem[] = bMarks.map((b) => ({
          id: b.fileId,
          name: b.name,
          mimeType: b.mimeType,
          webViewLink: b.webViewLink,
        }));
        setFiles(mappedFiles);
      } else {
        const result = await listDriveFiles(accessToken, {
          folderId: currentFolderId,
          searchQuery: searchQuery.trim() || undefined,
          mimeTypeFilter: mimeFilter !== 'all' ? mimeFilter : undefined,
        });
        setFiles(result.files);

        // Also refresh user bookmarks if logged in
        if (currentUser?.uid) {
          try {
            const bMarks = await fetchUserBookmarksFromFirestore(currentUser.uid);
            const bMap: Record<string, DriveBookmark> = {};
            bMarks.forEach((b) => {
              bMap[b.fileId] = b;
            });
            setBookmarks(bMap);
          } catch {
            // Non-blocking
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to load Google Drive files:', err);
      setAuthError(err.message || 'Failed to load files from Google Drive');
    } finally {
      setIsLoadingFiles(false);
    }
  }, [accessToken, currentFolderId, searchQuery, mimeFilter, currentUser?.uid]);

  // Load Drive user info / storage quota
  const loadAboutInfo = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await getDriveAbout(accessToken);
      setAboutInfo(data);
    } catch (e) {
      console.warn('Could not fetch drive about info:', e);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) {
      loadFiles();
      loadAboutInfo();
    }
  }, [accessToken, loadFiles, loadAboutInfo]);

  // Handle Google Login
  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setCurrentUser(res.user);
        setAccessToken(res.accessToken);
      }
    } catch (err: any) {
      console.error('Google Sign-in failed:', err);
      setAuthError(err.message || 'Google authentication failed. Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  };

  // Handle Google Logout
  const handleGoogleSignOut = async () => {
    await googleLogout();
    setCurrentUser(null);
    setAccessToken(null);
    setFiles([]);
    setAboutInfo(null);
  };

  // Navigate folder
  const handleOpenFolder = (folder: DriveFileItem) => {
    setCurrentFolderId(folder.id);
    setFolderBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    const target = folderBreadcrumbs[index];
    setFolderBreadcrumbs((prev) => prev.slice(0, index + 1));
    setCurrentFolderId(target.id);
  };

  // Toggle bookmark in Firestore
  const handleToggleBookmark = async (file: DriveFileItem) => {
    if (!currentUser?.uid) return;
    try {
      if (bookmarks[file.id]) {
        await removeDriveBookmarkFromFirestore(currentUser.uid, file.id);
        setBookmarks((prev) => {
          const next = { ...prev };
          delete next[file.id];
          return next;
        });
      } else {
        const saved = await saveDriveBookmarkToFirestore(currentUser.uid, file);
        setBookmarks((prev) => ({ ...prev, [file.id]: saved }));
      }
    } catch (e: any) {
      console.error('Failed to update bookmark in Firestore:', e);
    }
  };

  // Preview file content
  const handlePreviewFile = async (file: DriveFileItem) => {
    setPreviewFile({ item: file, isLoading: true });
    try {
      if (!accessToken) return;
      const content = await getDriveFileContent(accessToken, file.id, file.mimeType);
      setPreviewFile({ item: file, content, isLoading: false });
    } catch (err: any) {
      setPreviewFile({
        item: file,
        content: `Preview unavailable directly in-app (${err.message || 'Binary or unsupported type'}). Use "Open in Drive" below to view.`,
        isLoading: false,
      });
    }
  };

  // Create new file / folder
  const handleCreateFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !createModal.name.trim()) return;

    setCreateModal((prev) => ({ ...prev, isCreating: true }));
    try {
      let mimeType = 'text/plain';
      if (createModal.type === 'folder') {
        mimeType = 'application/vnd.google-apps.folder';
      } else if (createModal.type === 'doc') {
        mimeType = 'text/markdown';
      }

      await createDriveFile(accessToken, {
        name: createModal.name.trim(),
        mimeType,
        content: createModal.content,
        folderId: currentFolderId,
      });

      setCreateModal({
        isOpen: false,
        type: 'doc',
        name: '',
        content: '',
        isCreating: false,
      });
      loadFiles();
    } catch (err: any) {
      alert(`Error creating file: ${err.message}`);
      setCreateModal((prev) => ({ ...prev, isCreating: false }));
    }
  };

  // User confirmed delete execution
  const handleExecuteDelete = async () => {
    if (!deleteConfirm || !accessToken) return;
    setDeleteConfirm((prev) => (prev ? { ...prev, isDeleting: true } : null));

    try {
      await deleteDriveFile(accessToken, deleteConfirm.file.id, false);
      // If bookmarked in Firestore, clean it up
      if (currentUser?.uid && bookmarks[deleteConfirm.file.id]) {
        await removeDriveBookmarkFromFirestore(currentUser.uid, deleteConfirm.file.id);
      }
      setDeleteConfirm(null);
      loadFiles();
    } catch (err: any) {
      alert(`Failed to delete file: ${err.message}`);
      setDeleteConfirm((prev) => (prev ? { ...prev, isDeleting: false } : null));
    }
  };

  // File type icon helper
  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('folder')) {
      return <Folder className="w-5 h-5 text-amber-400 fill-amber-400/20" />;
    }
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
    }
    if (mimeType.includes('presentation')) {
      return <FileCheck className="w-5 h-5 text-orange-400" />;
    }
    if (mimeType.includes('document') || mimeType.includes('word') || mimeType.includes('text/plain')) {
      return <FileText className="w-5 h-5 text-sky-400" />;
    }
    return <FileCode className="w-5 h-5 text-neutral-400" />;
  };

  // Format bytes helper
  const formatBytes = (bytesStr?: string) => {
    if (!bytesStr) return '—';
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes)) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Firebase Status */}
      <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-950/40 border border-sky-500/30 text-sky-400 flex items-center justify-center shadow-sm">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-serif font-semibold text-white tracking-tight">
                  Google Drive Workspace Integration
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-mono bg-sky-950/50 text-sky-400 border border-sky-500/30 rounded-full">
                  Drive API v3
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Browse, search, create, and manage files securely with Firestore cloud persistence.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Firestore status indicator */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-[#141414] border border-[#222]">
              <Database className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-neutral-400 text-[11px]">Firestore:</span>
              <span className={firestoreOnline ? 'text-emerald-400 font-semibold' : 'text-neutral-500'}>
                {firestoreOnline ? 'Connected' : 'Connecting...'}
              </span>
            </div>

            {/* Auth status indicator */}
            {accessToken && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-emerald-950/40 text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Drive Token Active
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Auth Banner if not authenticated */}
      {!accessToken ? (
        <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-2xl p-8 text-center max-w-2xl mx-auto shadow-xl space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-sky-950/30 border border-sky-500/30 text-sky-400 mx-auto flex items-center justify-center shadow-lg shadow-sky-950/50">
            <HardDrive className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-serif font-semibold text-white">
              Connect Your Google Drive Account
            </h3>
            <p className="text-sm text-neutral-400 max-w-md mx-auto leading-relaxed">
              Authenticate via Google OAuth to list, view, upload, and organize files in Google Drive.
              All operations are protected with granular permissions and explicit confirmation guards.
            </p>
          </div>

          {/* Scopes Overview Card */}
          <div className="bg-[#121212] border border-[#222] rounded-xl p-4 text-left space-y-2 max-w-lg mx-auto">
            <span className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
              Configured OAuth Scopes:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {['drive', 'drive.file', 'drive.metadata.readonly', 'drive.activity.readonly', 'drive.readonly'].map(
                (sc) => (
                  <span
                    key={sc}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#181818] border border-[#2a2a2a] text-neutral-300"
                  >
                    https://www.googleapis.com/auth/{sc}
                  </span>
                )
              )}
            </div>
          </div>

          {authError && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs text-left max-w-lg mx-auto flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* Official Google Sign-in Button as required by Workspace Integration skill */}
          <div className="flex flex-col items-center justify-center pt-2">
            <button
              id="btn-google-drive-signin"
              onClick={handleGoogleSignIn}
              disabled={isSigningIn}
              className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-white hover:bg-neutral-100 text-neutral-900 font-medium text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-60 cursor-pointer"
            >
              <svg
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 48 48"
                className="w-5 h-5"
                style={{ display: 'block' }}
              >
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              <span>{isSigningIn ? 'Connecting to Google Drive...' : 'Sign in with Google'}</span>
            </button>
            <span className="text-[11px] text-neutral-500 mt-2">
              Pop-up authentication with Google Workspace authorization
            </span>
          </div>
        </div>
      ) : (
        /* Authenticated Drive Dashboard */
        <div className="space-y-6">
          {/* User & Storage Profile Strip */}
          <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-[#181818] border border-[#2a2a2a] flex items-center justify-center overflow-hidden">
                {aboutInfo?.user?.photoLink ? (
                  <img
                    src={aboutInfo.user.photoLink}
                    alt="User Avatar"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <UserCheck className="w-5 h-5 text-sky-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">
                    {aboutInfo?.user?.displayName || currentUser?.displayName || 'Google Drive User'}
                  </span>
                  <span className="text-xs text-neutral-400">
                    ({aboutInfo?.user?.emailAddress || currentUser?.email})
                  </span>
                </div>
                {/* Storage quota progress */}
                {aboutInfo?.storageQuota?.usage && aboutInfo?.storageQuota?.limit && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-32 h-1.5 rounded-full bg-[#222] overflow-hidden">
                      <div
                        className="h-full bg-sky-500 rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (parseInt(aboutInfo.storageQuota.usage, 10) /
                                parseInt(aboutInfo.storageQuota.limit, 10)) *
                                100
                            )
                          )}%`,
                        }}
                      ></div>
                    </div>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {formatBytes(aboutInfo.storageQuota.usage)} of{' '}
                      {formatBytes(aboutInfo.storageQuota.limit)} used
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                id="btn-drive-refresh"
                onClick={loadFiles}
                disabled={isLoadingFiles}
                className="px-3 py-1.5 rounded-lg bg-[#141414] hover:bg-[#1a1a1a] text-neutral-300 hover:text-white border border-[#222] text-xs font-medium flex items-center gap-1.5 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              <button
                id="btn-drive-new-file"
                onClick={() =>
                  setCreateModal({
                    isOpen: true,
                    type: 'doc',
                    name: 'Notes.md',
                    content: '# Project Notes\n\nCreated via Enterprise SSO Drive integration.',
                    isCreating: false,
                  })
                }
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center gap-1.5 transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create File</span>
              </button>

              <button
                id="btn-drive-new-folder"
                onClick={() =>
                  setCreateModal({
                    isOpen: true,
                    type: 'folder',
                    name: 'New Folder',
                    content: '',
                    isCreating: false,
                  })
                }
                className="px-3 py-1.5 rounded-lg bg-[#181818] hover:bg-[#202020] text-neutral-200 border border-[#2a2a2a] text-xs font-medium flex items-center gap-1.5 transition"
              >
                <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                <span>New Folder</span>
              </button>

              <button
                id="btn-drive-disconnect"
                onClick={handleGoogleSignOut}
                className="px-3 py-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 border border-rose-800/40 text-xs font-medium transition"
              >
                Disconnect Drive
              </button>
            </div>
          </div>

          {/* Search, Filter Bar & Breadcrumbs */}
          <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl p-4 space-y-4">
            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-1.5 text-xs text-neutral-400 overflow-x-auto pb-1">
              <span className="text-neutral-500">Location:</span>
              {folderBreadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.id}>
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-neutral-600 shrink-0" />}
                  <button
                    onClick={() => handleBreadcrumbClick(idx)}
                    className={`hover:text-sky-400 transition font-medium ${
                      idx === folderBreadcrumbs.length - 1 ? 'text-white' : 'text-neutral-400'
                    }`}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              {/* Search Bar */}
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search files in Google Drive..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadFiles()}
                  className="w-full bg-[#121212] border border-[#222] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-sky-500 transition"
                />
              </div>

              {/* Mime / Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
                {[
                  { id: 'all', label: 'All Files' },
                  { id: 'folder', label: 'Folders' },
                  { id: 'document', label: 'Docs & PDFs' },
                  { id: 'spreadsheet', label: 'Sheets' },
                  { id: 'bookmarks', label: 'Saved in Firestore' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setMimeFilter(f.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                      mimeFilter === f.id
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-[#141414] text-neutral-400 hover:text-white border border-[#222]'
                    }`}
                  >
                    {f.id === 'bookmarks' && <Bookmark className="w-3 h-3 inline mr-1 text-amber-400" />}
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Files List / Grid */}
          <div className="bg-[#0c0c0c] border border-[#1f1f1f] rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-[#1a1a1a] flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-300">
                {mimeFilter === 'bookmarks' ? 'Firestore Bookmarked Drive Files' : 'Files & Folders'}{' '}
                <span className="text-neutral-500 font-normal">({files.length} items)</span>
              </span>
              <span className="text-[11px] text-neutral-500 font-mono">
                Click a folder to explore sub-directories
              </span>
            </div>

            {isLoadingFiles ? (
              <div className="p-12 text-center text-neutral-400 space-y-3">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-sky-400" />
                <p className="text-xs font-mono">Loading files from Google Drive API...</p>
              </div>
            ) : files.length === 0 ? (
              <div className="p-12 text-center text-neutral-400 space-y-2">
                <Folder className="w-10 h-10 mx-auto text-neutral-600" />
                <p className="text-sm text-neutral-300 font-medium">No files found</p>
                <p className="text-xs text-neutral-500">
                  {mimeFilter === 'bookmarks'
                    ? 'You have not saved any files to Firestore yet. Click the bookmark icon next to any file.'
                    : 'This folder is empty or no files match your search criteria.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#171717]">
                {files.map((file) => {
                  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                  const isBookmarked = !!bookmarks[file.id];

                  return (
                    <div
                      key={file.id}
                      className="p-3.5 sm:p-4 hover:bg-[#121212] flex items-center justify-between gap-4 transition-colors group"
                    >
                      {/* Left: Icon & Info */}
                      <div
                        className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                        onClick={() => {
                          if (isFolder) {
                            handleOpenFolder(file);
                          } else {
                            handlePreviewFile(file);
                          }
                        }}
                      >
                        <div className="w-9 h-9 rounded-lg bg-[#161616] border border-[#262626] flex items-center justify-center shrink-0">
                          {getFileIcon(file.mimeType)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-medium text-white hover:text-sky-300 transition truncate">
                              {file.name}
                            </span>
                            {isFolder && (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-500/20">
                                Folder
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-neutral-500 mt-0.5">
                            <span>{formatBytes(file.size)}</span>
                            {file.modifiedTime && (
                              <span>Modified: {new Date(file.modifiedTime).toLocaleDateString()}</span>
                            )}
                            {file.owners?.[0] && (
                              <span className="hidden sm:inline">Owner: {file.owners[0].displayName}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Bookmark to Firestore button */}
                        <button
                          title={isBookmarked ? 'Remove from Firestore' : 'Save bookmark to Firestore'}
                          onClick={() => handleToggleBookmark(file)}
                          className={`p-2 rounded-lg text-xs transition border ${
                            isBookmarked
                              ? 'bg-amber-950/40 text-amber-300 border-amber-500/30'
                              : 'bg-[#141414] text-neutral-400 hover:text-neutral-200 border-[#222]'
                          }`}
                        >
                          {isBookmarked ? (
                            <BookmarkCheck className="w-4 h-4 text-amber-400" />
                          ) : (
                            <Bookmark className="w-4 h-4" />
                          )}
                        </button>

                        {/* Open in Drive external */}
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open directly in Google Drive"
                            className="p-2 rounded-lg bg-[#141414] hover:bg-[#1c1c1c] text-neutral-400 hover:text-white border border-[#222] transition"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}

                        {/* Preview button */}
                        {!isFolder && (
                          <button
                            title="Preview Content"
                            onClick={() => handlePreviewFile(file)}
                            className="p-2 rounded-lg bg-[#141414] hover:bg-[#1c1c1c] text-neutral-400 hover:text-white border border-[#222] transition"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}

                        {/* Delete / Trash button (Triggers MANDATORY confirmation dialog) */}
                        <button
                          title="Delete or Move to Trash (Requires Confirmation)"
                          onClick={() => setDeleteConfirm({ file, isOpen: true, isDeleting: false })}
                          className="p-2 rounded-lg bg-[#141414] hover:bg-rose-950/40 text-neutral-400 hover:text-rose-300 border border-[#222] hover:border-rose-800/40 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MANDATORY CONFIRMATION MODAL FOR DESTRUCTIVE OPERATION (Required by workspace-integration skill) */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#0f0f0f] border border-rose-900/50 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-950/40 border border-rose-600/30 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-serif font-semibold text-white">
                  Confirm Google Drive Deletion
                </h3>
                <p className="text-xs text-neutral-400">Workspace User Data Mutation Guard</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#141414] border border-[#222] space-y-2">
              <p className="text-xs text-neutral-300">
                Are you sure you want to move the following item to your Google Drive trash bin?
              </p>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-[#0a0a0a] border border-[#1f1f1f]">
                {getFileIcon(deleteConfirm.file.mimeType)}
                <span className="text-xs font-medium text-white truncate">
                  {deleteConfirm.file.name}
                </span>
              </div>
              <p className="text-[11px] text-neutral-500">
                Trashed items can still be recovered from your Google Drive Trash within 30 days.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={deleteConfirm.isDeleting}
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-xl bg-[#181818] hover:bg-[#222] text-neutral-300 text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteConfirm.isDeleting}
                onClick={handleExecuteDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition flex items-center gap-1.5 shadow-md shadow-rose-950/50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleteConfirm.isDeleting ? 'Moving to Trash...' : 'Yes, Move to Trash'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f0f0f] border border-[#222] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#1f1f1f]">
              <div className="flex items-center gap-2.5 min-w-0">
                {getFileIcon(previewFile.item.mimeType)}
                <h3 className="text-sm font-serif font-semibold text-white truncate">
                  {previewFile.item.name}
                </h3>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#070707] border border-[#1a1a1a] rounded-xl p-4 font-mono text-xs text-neutral-200 whitespace-pre-wrap leading-relaxed">
              {previewFile.isLoading ? (
                <div className="flex items-center justify-center py-12 text-neutral-500 gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                  <span>Loading content from Google Drive...</span>
                </div>
              ) : (
                previewFile.content || 'File content is empty.'
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#1f1f1f]">
              <span className="text-[11px] text-neutral-500 font-mono">
                MIME: {previewFile.item.mimeType}
              </span>
              {previewFile.item.webViewLink && (
                <a
                  href={previewFile.item.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Google Drive</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create File / Folder Modal */}
      {createModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form
            onSubmit={handleCreateFileSubmit}
            className="bg-[#0f0f0f] border border-[#222] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#1f1f1f]">
              <div className="flex items-center gap-2">
                {createModal.type === 'folder' ? (
                  <FolderPlus className="w-5 h-5 text-amber-400" />
                ) : (
                  <Plus className="w-5 h-5 text-sky-400" />
                )}
                <h3 className="text-sm font-serif font-semibold text-white">
                  {createModal.type === 'folder' ? 'Create New Folder' : 'Create New Document'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCreateModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1 rounded-lg text-neutral-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  required
                  value={createModal.name}
                  onChange={(e) => setCreateModal((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={createModal.type === 'folder' ? 'Folder Name' : 'Document.md'}
                  className="w-full bg-[#141414] border border-[#2a2a2a] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              {createModal.type !== 'folder' && (
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Initial Content (Markdown / Text)
                  </label>
                  <textarea
                    rows={6}
                    value={createModal.content}
                    onChange={(e) => setCreateModal((prev) => ({ ...prev, content: e.target.value }))}
                    className="w-full bg-[#141414] border border-[#2a2a2a] rounded-xl p-3 text-xs text-white font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setCreateModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-xl bg-[#181818] hover:bg-[#222] text-neutral-300 text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createModal.isCreating}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition flex items-center gap-1.5 shadow-md shadow-sky-950/50"
              >
                {createModal.isCreating ? 'Creating...' : 'Create in Google Drive'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
