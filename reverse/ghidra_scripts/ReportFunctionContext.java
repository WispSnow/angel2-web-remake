// Reports a function's instructions, direct calls, and incoming references.
// @category Angel2

import java.util.LinkedHashSet;
import java.util.Set;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.symbol.Reference;

public class ReportFunctionContext extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length == 0) {
            throw new IllegalArgumentException("Expected one or more function addresses");
        }

        for (String text : args) {
            Address address = currentProgram.getAddressFactory().getAddress(text);
            Function function = getFunctionContaining(address);
            if (function == null) {
                println("NO_FUNCTION address=" + address);
                continue;
            }
            println("FUNCTION name=" + function.getName() +
                " entry=" + function.getEntryPoint() +
                " body=" + function.getBody());

            println("INCOMING");
            for (Reference reference : getReferencesTo(function.getEntryPoint())) {
                Function caller = getFunctionContaining(reference.getFromAddress());
                println("  from=" + reference.getFromAddress() +
                    " type=" + reference.getReferenceType() +
                    " function=" + (caller == null ? "<none>" : caller.getName()));
            }

            Set<String> calls = new LinkedHashSet<>();
            InstructionIterator instructions = currentProgram.getListing()
                .getInstructions(function.getBody(), true);
            while (instructions.hasNext()) {
                Instruction instruction = instructions.next();
                println("  " + instruction.getAddress() + "  " + instruction);
                for (Reference reference : instruction.getReferencesFrom()) {
                    if (reference.getReferenceType().isCall()) {
                        Function callee = getFunctionAt(reference.getToAddress());
                        calls.add(reference.getToAddress() + " " +
                            (callee == null ? "<none>" : callee.getName()));
                    }
                }
            }
            println("DIRECT_CALLS");
            for (String call : calls) {
                println("  " + call);
            }
        }
    }
}
