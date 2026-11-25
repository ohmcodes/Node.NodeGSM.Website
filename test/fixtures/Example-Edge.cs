using System;
namespace WindowsGSM.Plugins
{
    public class Helper { public string StartPath = "helper.exe"; }

    public class Edge
    {
        const string NAME = "Edge Server";
        const string EXE = "edge/server.exe";
        public Plugin Plugin = new Plugin()
        {
            name = "Edge",
            author = "A \\ B",
            description = @"Verbatim ""quoted"" text",
            version = "3",
            url = "http://example.org/{not-a-placeholder}"
        };
        public string StartPath => EXE;
        public string FullName => NAME;
        public bool AllowsEmbedConsole { get; } = true;
        public string Port = "1" + "234";
        public string Maxplayers = "8";
        public string Additional = "-a \"b c\" // not a comment";
        public object QueryMethod = new FIVEM();
        public async Task<Process> Start()
        {
            string dataPath = Path.Combine(root, "data");
            string param = $"--datapath \"{dataPath}\" --port {_serverData.ServerPort}";
            if (embed) { param += " --embed"; }
            var p = new Process { StartInfo = { FileName = StartPath, Arguments = param } };
            return p;
        }
    }
}
