package main

import (
	"crypto/sha1"
	"crypto/tls"
	"crypto/x509"
	"flag"
	"fmt"
	"os"
)

func main() {
	host := flag.String("hostname", "oidc.eks.eu-west-1.amazonaws.com", "Hostname to get root CA fingerprint for")
	port := flag.Int("port", 443, "Port to query")
	debug := flag.Bool("debug", false, "Print cert CN to stderr")
	flag.Parse()

	target := fmt.Sprintf("%s:%d", *host, *port)
	conn, err := tls.Dial("tcp", target, &tls.Config{
		InsecureSkipVerify: true,
	})
	if err != nil {
		fmt.Printf("Error dialing remote host: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close()

	cs := conn.ConnectionState()
	numCerts := len(cs.PeerCertificates)
	var root *x509.Certificate
	// Important! Get the last cert in the chain, which is the root CA.
	if numCerts >= 1 {
		root = cs.PeerCertificates[numCerts-1]
	} else {
		fmt.Printf("Error getting cert list from connection \n")
		os.Exit(1)
	}
	if *debug {
		fmt.Fprintf(os.Stderr, "%s\n", root.Subject.CommonName)
	}
	// print out the fingerprint
	fmt.Printf("%x\n", sha1.Sum(root.Raw))
}
