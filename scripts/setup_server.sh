#!/bin/bash
# Setup script for resume.bevansatria.my.id server

set -e

echo "Updating system..."
sudo apt update && sudo apt upgrade -y

echo "Installing prerequisites..."
sudo apt install -y nginx nodejs npm python3-venv python3-pip screen git certbot python3-certbot-nginx curl

# Try to install n for managing Node versions, just in case they need a newer version for Next.js 16
sudo npm install -g n || true
sudo n lts || true

echo "Setting up Nginx configuration..."
sudo cp nginx/resume.bevansatria.my.id.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/resume.bevansatria.my.id.conf /etc/nginx/sites-enabled/

# Remove default nginx config if exists
sudo rm -f /etc/nginx/sites-enabled/default

echo "Testing Nginx configuration..."
sudo nginx -t
sudo systemctl reload nginx

echo "Setting up SSL with Certbot..."
# The user might need to hit Enter or provide email, but we'll try to run it semi-automated
sudo certbot --nginx -d resume.bevansatria.my.id --non-interactive --agree-tos --register-unsafely-without-email || echo "Certbot failed, please run manually: sudo certbot --nginx -d resume.bevansatria.my.id"

echo "Setup complete. You can now run the deployment script or let GitHub Actions trigger it."
