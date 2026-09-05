import { doc, setDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  owners?: { displayName: string; emailAddress?: string; photoLink?: string }[];
  shared?: boolean;
  trashed?: boolean;
  parents?: string[];
}

export interface DriveAboutInfo {
  user?: {
    displayName: string;
    emailAddress: string;
    photoLink?: string;
  };
  storageQuota?: {
    limit?: string;
    usage?: string;
    usageInDrive?: string;
    usageInDriveTrash?: string;
  };
}

export interface DriveBookmark {
  fileId: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  userId: string;
  savedAt: string;
}

/**
 * Fetch files from Google Drive v3 REST API
 */
export async function listDriveFiles(
  accessToken: string,
  options: {
    folderId?: string;
    searchQuery?: string;
    mimeTypeFilter?: string;
    pageToken?: string;
    pageSize?: number;
  } = {}
): Promise<{ files: DriveFileItem[]; nextPageToken?: string }> {
  const queryParts: string[] = ['trashed = false'];

  if (options.folderId && options.folderId !== 'root') {
    queryParts.push(`'${options.folderId}' in parents`);
  }

  if (options.searchQuery && options.searchQuery.trim()) {
    const escaped = options.searchQuery.replace(/'/g, "\\'");
    queryParts.push(`name contains '${escaped}'`);
  }

  if (options.mimeTypeFilter) {
    if (options.mimeTypeFilter === 'folder') {
      queryParts.push("mimeType = 'application/vnd.google-apps.folder'");
    } else if (options.mimeTypeFilter === 'document') {
      queryParts.push(
        "(mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain' or mimeType = 'application/pdf' or mimeType = 'text/markdown')"
      );
    } else if (options.mimeTypeFilter === 'spreadsheet') {
      queryParts.push(
        "(mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'text/csv')"
      );
    } else if (options.mimeTypeFilter === 'presentation') {
      queryParts.push("mimeType = 'application/vnd.google-apps.presentation'");
    } else if (options.mimeTypeFilter === 'image') {
      queryParts.push("mimeType contains 'image/'");
    }
  }

  const q = queryParts.join(' and ');
  const fields =
    'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,webViewLink,iconLink,thumbnailLink,owners,shared,trashed,parents)';
  const pageSize = options.pageSize || 40;

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('pageSize', pageSize.toString());
  url.searchParams.set('fields', fields);
  url.searchParams.set('orderBy', 'folder,modifiedTime desc');
  url.searchParams.set('q', q);
  if (options.pageToken) {
    url.searchParams.set('pageToken', options.pageToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Google Drive API error: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    files: data.files || [],
    nextPageToken: data.nextPageToken,
  };
}

/**
 * Fetch Google Drive storage quota and user profile
 */
export async function getDriveAbout(accessToken: string): Promise<DriveAboutInfo> {
  const url = 'https://www.googleapis.com/drive/v3/about?fields=user,storageQuota';
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to fetch Google Drive user and quota info');
  }

  return response.json();
}

/**
 * Read text content from a Google Drive file or export Google Doc
 */
export async function getDriveFileContent(
  accessToken: string,
  fileId: string,
  mimeType: string
): Promise<string> {
  let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  if (mimeType === 'application/vnd.google-apps.document') {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
  } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to load file content: ${response.statusText}`);
  }

  return response.text();
}

/**
 * Create a new file or folder in Google Drive
 */
export async function createDriveFile(
  accessToken: string,
  params: {
    name: string;
    mimeType: string;
    content?: string;
    folderId?: string;
  }
): Promise<DriveFileItem> {
  if (params.mimeType === 'application/vnd.google-apps.folder') {
    // Create folder
    const metadata: any = {
      name: params.name,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (params.folderId && params.folderId !== 'root') {
      metadata.parents = [params.folderId];
    }

    const res = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to create folder in Google Drive');
    }
    return res.json();
  }

  // Create file with content (multipart/related)
  const metadata: any = {
    name: params.name,
    mimeType: params.mimeType,
  };
  if (params.folderId && params.folderId !== 'root') {
    metadata.parents = [params.folderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const content = params.content || '';
  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${params.mimeType}\r\n\r\n` +
    content +
    closeDelimiter;

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to upload file to Google Drive');
  }

  return res.json();
}

/**
 * Permanently delete or trash file from Google Drive
 * Note: Must be guarded by an explicit user confirmation dialog!
 */
export async function deleteDriveFile(
  accessToken: string,
  fileId: string,
  permanent: boolean = false
): Promise<void> {
  if (permanent) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to permanently delete file from Google Drive');
    }
  } else {
    // Move to Trash (safer)
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to move file to trash in Google Drive');
    }
  }
}

// ----------------------------------------------------------------------
// FIRESTORE BOOKMARKS INTEGRATION
// Synchronize and persist Google Drive saved bookmarks into Firestore
// ----------------------------------------------------------------------

export async function saveDriveBookmarkToFirestore(
  userId: string,
  file: DriveFileItem
): Promise<DriveBookmark> {
  const path = `users/${userId}/driveBookmarks/${file.id}`;
  const bookmark: DriveBookmark = {
    fileId: file.id,
    name: file.name,
    mimeType: file.mimeType,
    webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
    userId,
    savedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'users', userId, 'driveBookmarks', file.id), bookmark);
    return bookmark;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchUserBookmarksFromFirestore(userId: string): Promise<DriveBookmark[]> {
  const path = `users/${userId}/driveBookmarks`;
  try {
    const snapshot = await getDocs(collection(db, 'users', userId, 'driveBookmarks'));
    const bookmarks: DriveBookmark[] = [];
    snapshot.forEach((d) => {
      bookmarks.push(d.data() as DriveBookmark);
    });
    return bookmarks;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function removeDriveBookmarkFromFirestore(
  userId: string,
  fileId: string
): Promise<void> {
  const path = `users/${userId}/driveBookmarks/${fileId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'driveBookmarks', fileId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
