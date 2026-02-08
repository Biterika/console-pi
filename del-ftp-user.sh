#!/bin/bash
USERNAME=$1

if [ -z "$USERNAME" ]; then
    echo "Usage: $0 username"
    exit 1
fi

# Remove from password file
grep -v "^${USERNAME}:" /etc/vsftpd/ftpd.passwd > /tmp/ftpd.passwd.tmp 2>/dev/null || true
mv /tmp/ftpd.passwd.tmp /etc/vsftpd/ftpd.passwd

# Remove user config
rm -f /etc/vsftpd/users/${USERNAME}

echo "FTP user ${USERNAME} removed"
