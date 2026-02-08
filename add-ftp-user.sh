#!/bin/bash
# Usage: add-ftp-user.sh username password

USERNAME=$1
PASSWORD=$2

if [ -z "$USERNAME" ] || [ -z "$PASSWORD" ]; then
    echo "Usage: $0 username password"
    exit 1
fi

# Generate password hash (md5)
HASH=$(openssl passwd -1 "$PASSWORD")

# Add to password file
grep -v "^${USERNAME}:" /etc/vsftpd/ftpd.passwd > /tmp/ftpd.passwd.tmp 2>/dev/null || true
echo "${USERNAME}:${HASH}" >> /tmp/ftpd.passwd.tmp
mv /tmp/ftpd.passwd.tmp /etc/vsftpd/ftpd.passwd
chmod 600 /etc/vsftpd/ftpd.passwd

# Create user config
cat > /etc/vsftpd/users/${USERNAME} << USEREOF
local_root=/mnt/lxd-storage/containers/beebro-${USERNAME}/rootfs
USEREOF

echo "FTP user ${USERNAME} created"
