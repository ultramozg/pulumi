package main

import (
	"bytes"
	"crypto/md5"
	"crypto/tls"
	"flag"
	"fmt"
)

func main() {
	// Parse cmdline arguments using flag package
	server := flag.String("server", "abhi.host", "Server to ping")
	port := flag.Uint("port", 443, "Port that has TLS")
	flag.Parse()

	conn, err := tls.Dial("tcp", fmt.Sprintf("%s:%d", *server, *port), &tls.Config{})
	if err != nil {
		panic("failed to connect: " + err.Error())
	}

	// Get the ConnectionState struct as that's the one which gives us x509.Certificate struct
	cert := conn.ConnectionState().PeerCertificates[0]
	fingerprint := md5.Sum(cert.Raw)

	var buf bytes.Buffer
	for i, f := range fingerprint {
		if i > 0 {
			fmt.Fprintf(&buf, ":")
		}
		fmt.Fprintf(&buf, "%02X", f)
	}
	fmt.Printf("Fingerprint for %s: %s", *server, buf.String())

	conn.Close()
}
