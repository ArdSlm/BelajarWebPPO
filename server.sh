#!/bin/bash

# Server Management Script

show_menu() {
    echo ""
    echo "╔════════════════════════════════════╗"
    echo "║   Server Management - sirobo.codes  ║"
    echo "╚════════════════════════════════════╝"
    echo ""
    echo "1. Start Server"
    echo "2. Stop Server"
    echo "3. Status"
    echo "4. View Logs (Website)"
    echo "5. View Logs (Cloudflare)"
    echo "6. Restart Server"
    echo "0. Exit"
    echo ""
}

start_server() {
    echo "🚀 Starting server..."
    systemctl --user start website cloudflared
    sleep 2
    echo "✅ Server started"
    systemctl --user status website cloudflared --no-pager | grep "Active"
}

stop_server() {
    echo "⏸ Stopping server..."
    systemctl --user stop website cloudflared
    sleep 1
    echo "✅ Server stopped"
}

show_status() {
    echo ""
    echo "📊 Server Status:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    systemctl --user status website --no-pager | grep -E "Active:|Main PID:" | sed 's/^/  /'
    echo ""
    systemctl --user status cloudflared --no-pager | grep -E "Active:|Main PID:" | sed 's/^/  /'
    echo ""
    echo "🌐 Access:"
    echo "  Local:  http://localhost:8080"
    echo "  Public: https://sirobo.codes"
    echo ""
}

view_website_logs() {
    echo "📝 Website Logs (last 20 lines):"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    journalctl --user -u website -n 20 --no-pager
    echo ""
}

view_cloudflare_logs() {
    echo "📡 Cloudflare Tunnel Logs (last 20 lines):"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    journalctl --user -u cloudflared -n 20 --no-pager
    echo ""
}

restart_server() {
    echo "🔄 Restarting server..."
    systemctl --user restart website cloudflared
    sleep 2
    echo "✅ Server restarted"
    systemctl --user status website cloudflared --no-pager | grep "Active"
}

while true; do
    show_menu
    read -p "Choose an option: " choice
    
    case $choice in
        1)
            start_server
            ;;
        2)
            stop_server
            ;;
        3)
            show_status
            ;;
        4)
            view_website_logs
            ;;
        5)
            view_cloudflare_logs
            ;;
        6)
            restart_server
            ;;
        0)
            echo "👋 Goodbye!"
            exit 0
            ;;
        *)
            echo "❌ Invalid option. Please try again."
            ;;
    esac
done
